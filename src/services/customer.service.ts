import { AppDataSource } from '../config/data-source';
import { Customer } from '../entities/Customer';
import { SalesInvoice } from '../entities/SalesInvoice';
import { ILike } from 'typeorm';

export class CustomerService {
  private customerRepo = AppDataSource.getRepository(Customer);

  async findAll(filters: { search?: string; status?: string; mobile?: string; page?: number; limit?: number }) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const qb = this.customerRepo.createQueryBuilder('c');

    if (filters.status) qb.andWhere('c.status = :status', { status: filters.status });
    if (filters.mobile) qb.andWhere('c.mobile = :mobile', { mobile: filters.mobile });
    if (filters.search) {
      qb.andWhere('(c.name ILIKE :search OR c.mobile ILIKE :search)', { search: `%${filters.search}%` });
    }

    qb.orderBy('c.created_at', 'DESC').skip(skip).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findByMobile(mobile: string) {
    return this.customerRepo.findOneBy({ mobile });
  }

  async create(data: Partial<Customer>) {
    const customer = this.customerRepo.create(data);
    return this.customerRepo.save(customer);
  }

  async update(id: string, data: Partial<Customer>) {
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
