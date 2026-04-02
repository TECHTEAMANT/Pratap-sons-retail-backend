import { AppDataSource } from '../config/data-source';
import { Customer } from '../entities/Customer';
import { SalesInvoice } from '../entities/SalesInvoice';
import { SalesReturn } from '../entities/SalesReturn';
import { LoyaltyHistory } from '../entities';
import { ILike, Or } from 'typeorm';

export class CustomerService {
  private customerRepo = AppDataSource.getRepository(Customer);

  async recalculateCustomerStats(mobile?: string): Promise<{
    invoicesRepaired: number;
    returnsRepaired: number;
    customersProcessed: number;
    errors: number;
  }> {
    const results = {
      invoicesRepaired: 0,
      returnsRepaired: 0,
      customersProcessed: 0,
      errors: 0
    };

    try {
      // 1. Repair all Invoices first (to fix astronomical MRPs/Totals)
      const invoicesToFix = await AppDataSource.getRepository(SalesInvoice).find({
        relations: ['items']
      });

      for (const inv of invoicesToFix) {
        try {
          const total_mrp = inv.items.reduce((sum, item) => sum + Number(item.mrp), 0);
          const taxable_value = inv.items.reduce((sum, item) => sum + Number(item.taxable_value), 0);
          const total_gst = inv.items.reduce((sum, item) => sum + Number(item.cgst_amount || 0) + Number(item.sgst_amount || 0) + Number(item.igst_amount || 0), 0);
          const total_discount = inv.items.reduce((sum, item) => sum + Number(item.discount), 0);
          const net_payable = inv.items.reduce((sum, item) => sum + Number(item.total_value), 0);
          
          // Only update if there's a significant mismatch or to ensure numeric type
          inv.total_mrp = parseFloat(total_mrp.toFixed(2));
          inv.taxable_value = parseFloat(taxable_value.toFixed(2));
          inv.total_gst = parseFloat(total_gst.toFixed(2));
          inv.total_discount = parseFloat(total_discount.toFixed(2));
          inv.net_payable = parseFloat(net_payable.toFixed(2));
          
          await AppDataSource.getRepository(SalesInvoice).save(inv);
          results.invoicesRepaired++;
        } catch (e) {
          console.error(`Error repairing invoice ${inv.id}:`, e);
          results.errors++;
        }
      }

      // 2. Repair all Returns
      const returnsToFix = await AppDataSource.getRepository(SalesReturn).find({
        relations: ['items']
      });

      for (const ret of returnsToFix) {
        try {
          const total_return = ret.items.reduce((sum, item) => sum + Number(item.return_amount), 0);
          ret.total_return_amount = parseFloat(total_return.toFixed(2));
          await AppDataSource.getRepository(SalesReturn).save(ret);
          results.returnsRepaired++;
        } catch (e) {
          console.error(`Error repairing return ${ret.id}:`, e);
          results.errors++;
        }
      }

      // 3. Recalculate Customers
      const customers = mobile 
        ? await this.customerRepo.find({ where: { mobile } })
        : await this.customerRepo.find();

      for (const customer of customers) {
        try {
          const customerInvoices = await AppDataSource.getRepository(SalesInvoice).find({
            where: { customer_mobile: customer.mobile }
          });

          const customerReturns = await AppDataSource.getRepository(SalesReturn).find({
            where: { customer_mobile: customer.mobile }
          });

          const loyaltyHistory = await AppDataSource.getRepository(LoyaltyHistory).find({
            where: { customer_id: customer.id }
          });

          const total_purchases = customerInvoices.reduce((sum, inv) => sum + Number(inv.net_payable), 0);
          const total_returns = customerReturns.reduce((sum, ret) => sum + Number(ret.total_return_amount), 0);
          const total_visits = customerInvoices.length;
          const return_count = customerReturns.length;
          
          const lifetime_earned = loyaltyHistory
            .filter(h => h.type === 'EARN' || h.type === 'BIRTHDAY' || h.type === 'ANNIVERSARY' || (h.type === 'ADJUSTMENT' && Number(h.points) > 0))
            .reduce((sum, h) => sum + Number(h.points), 0);
            
          const current_balance = loyaltyHistory.reduce((sum, h) => sum + Number(h.points), 0);

          customer.total_purchases = parseFloat(total_purchases.toFixed(2));
          customer.total_returns = parseFloat(total_returns.toFixed(2));
          customer.total_visits = total_visits;
          customer.return_count = return_count;
          customer.loyalty_points = parseFloat(lifetime_earned.toFixed(2));
          customer.loyalty_points_balance = parseFloat(current_balance.toFixed(2));

          await this.customerRepo.save(customer);
          results.customersProcessed++;
        } catch (err) {
          console.error(`Error recalculating stats for ${customer.mobile}:`, err);
          results.errors++;
        }
      }
    } catch (e) {
      console.error('Deep repair failed:', e);
      results.errors++;
    }

    return results;
  }

  /** Generate a unique 10-digit card number prefixed with PSH */
  private async generateCardNo(): Promise<string> {
    while (true) {
      const num = Math.floor(1000000000 + Math.random() * 9000000000);
      const card_no = `PSH${num}`;
      const existing = await this.customerRepo.findOneBy({ card_no });
      if (!existing) return card_no;
    }
  }

  async findAll(filters: { search?: string; status?: string; mobile?: string; page?: number; limit?: number }) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const qb = this.customerRepo.createQueryBuilder('c');

    if (filters.status) qb.andWhere('c.status = :status', { status: filters.status });
    
    if (filters.mobile) {
      const mobiles = filters.mobile.split(',').filter(m => m.trim());
      if (mobiles.length > 1) {
        qb.andWhere('c.mobile IN (:...mobiles)', { mobiles });
      } else if (mobiles.length === 1) {
        qb.andWhere('c.mobile = :mobile', { mobile: mobiles[0] });
      }
    }

    if (filters.search) {
      qb.andWhere(
        '(c.name ILIKE :search OR c.mobile ILIKE :search OR c.card_no ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    qb.orderBy('c.created_at', 'DESC').skip(skip).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findByMobile(mobile: string) {
    return this.customerRepo.findOneBy({ mobile });
  }

  /** Ensures a customer record exists for a given mobile. Creates it if missing. */
  async ensureCustomerExists(data: { mobile: string; name: string; card_no?: string }) {
    if (!data.mobile || data.mobile.length < 9) return null;
    
    const mobile = data.mobile.trim();
    let customer = await this.customerRepo.findOneBy({ mobile });
    
    if (customer) {
      return customer;
    }
    
    // Create new customer record automatically
    const newCustomer = this.customerRepo.create({
      mobile,
      name: data.name || 'Walk-in Customer',
      card_no: data.card_no || await this.generateCardNo(),
      status: 'active'
    });
    
    return this.customerRepo.save(newCustomer);
  }

  async findByCard(card_no: string) {
    return this.customerRepo.findOneBy({ card_no });
  }

  private normalizeDates(data: any) {
    if (data.birthday === '') data.birthday = null;
    if (data.anniversary === '') data.anniversary = null;
    return data;
  }

  async create(data: Partial<Customer>) {
    this.normalizeDates(data);
    const customer = this.customerRepo.create(data);
    // Auto-generate card_no if not provided
    if (!customer.card_no) {
      customer.card_no = await this.generateCardNo();
    }
    return this.customerRepo.save(customer);
  }

  async update(id: string, data: Partial<Customer>) {
    this.normalizeDates(data);
    const customer = await this.customerRepo.findOneBy({ id });
    if (!customer) return null;
    Object.assign(customer, data);
    return this.customerRepo.save(customer);
  }

  async getPurchaseHistory(mobile: string) {
    return AppDataSource.getRepository(SalesInvoice).find({
      where: { customer_mobile: mobile },
      order: { invoice_date: 'DESC' },
      take: 50,
    });
  }

  async backfillCardNumbers(): Promise<{ count: number }> {
    const customers = await this.customerRepo
      .createQueryBuilder('c')
      .where('c.card_no IS NULL')
      .getMany();

    let count = 0;
    for (const customer of customers) {
      customer.card_no = await this.generateCardNo();
      await this.customerRepo.save(customer);
      count++;
    }
    return { count };
  }

  async getCreditBalance(mobile: string) {
    const customer = await this.customerRepo.findOneBy({ mobile });
    if (!customer) return null;
    return {
      mobile: customer.mobile,
      name: customer.name,
      credit_balance: customer.credit_balance,
      total_returns: customer.total_returns,
      return_count: customer.return_count,
    };
  }
}

export const customerService = new CustomerService();
