import { AppDataSource } from '../config/data-source';
import { SalesReturn } from '../entities/SalesReturn';
import { SalesReturnItem } from '../entities/SalesReturnItem';
import { SalesInvoice } from '../entities/SalesInvoice';
import { CreditNote } from '../entities/CreditNote';
import { CreditNoteApplication } from '../entities/CreditNoteApplication';
import { BarcodeBatch } from '../entities/BarcodeBatch';
import { Customer, LoyaltyConfig, LoyaltyHistory, LoyaltyTransactionType } from '../entities';
import { ILike, In } from 'typeorm';

export class SalesReturnService {
  private returnRepo = AppDataSource.getRepository(SalesReturn);
  private cnRepo = AppDataSource.getRepository(CreditNote);

  async findAll(filters: { start_date?: string; end_date?: string; search?: string }) {
    const qb = this.returnRepo.createQueryBuilder('sr');
    if (filters.start_date) qb.andWhere('sr.return_date >= :start', { start: filters.start_date });
    if (filters.end_date) qb.andWhere('sr.return_date <= :end', { end: filters.end_date });
    if (filters.search) qb.andWhere('(sr.return_number ILIKE :s OR sr.customer_name ILIKE :s)', { s: `%${filters.search}%` });
    qb.orderBy('sr.created_at', 'DESC');
    return qb.getMany();
  }

  async findById(id: string) {
    return this.returnRepo.findOne({ 
      where: { id }, 
      relations: ['items', 'salesman', 'items.salesman'] 
    });
  }

  async create(data: any, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      const count = await manager.count(SalesReturn);
      const retNum = `RET${new Date().getFullYear()}${(count + 1).toString().padStart(6, '0')}`;

      const ret = manager.create(SalesReturn, {
        return_number: retNum,
        return_date: data.return_date,
        invoice_id: data.invoice_id,
        invoice_number: data.invoice_number,
        customer_mobile: data.customer_mobile,
        customer_name: data.customer_name,
        return_reason: data.return_reason,
        total_return_amount: data.total_return_amount,
        status: 'completed',
        created_by: userId,
        salesman_id: data.salesman_id || null,
      });
      const savedReturn = await manager.save(ret);

      // Create return items & restore inventory
      for (const item of data.items) {
        const retItem = manager.create(SalesReturnItem, {
          return_id: savedReturn.id,
          barcode_8digit: item.barcode_8digit,
          design_no: item.design_no,
          hsn_code: item.hsn_code || null,
          quantity: item.quantity || 1,
          mrp: item.mrp,
          taxable_value: item.taxable_value,
          gst_amount: item.gst_amount || 0,
          return_amount: item.return_amount,
          reason: item.reason || null,
          salesman_id: item.salesman_id || null,
        });
        await manager.save(retItem);

        // Restore inventory
        const batch = await manager.findOne(BarcodeBatch, { where: { barcode_alias_8digit: item.barcode_8digit } });
        if (batch) {
          batch.available_quantity += (item.quantity || 1);
          await manager.save(batch);
        }
      }

      // Create credit note
      const cnNum = `CN${new Date().getFullYear()}${Math.floor(100000 + Math.random() * 900000)}`;
      const cn = manager.create(CreditNote, {
        credit_note_number: cnNum,
        credit_date: data.return_date,
        customer_mobile: data.customer_mobile,
        customer_name: data.customer_name,
        return_id: savedReturn.id,
        invoice_id: data.invoice_id,
        credit_amount: data.total_return_amount,
        balance_remaining: data.total_return_amount,
        status: 'active',
        created_by: userId,
      });
      await manager.save(cn);

      // Update customer credit balance
      const customer = await manager.findOne(Customer, { where: { mobile: data.customer_mobile } });
      if (customer) {
        customer.credit_balance = Number(customer.credit_balance) + Number(data.total_return_amount);
        customer.total_returns = Number(customer.total_returns) + Number(data.total_return_amount);
        customer.return_count = (customer.return_count || 0) + 1;

        const invoice = await manager.findOne(SalesInvoice, { where: { id: data.invoice_id } });
        
        // Deduct loyalty points earned
        const loyaltyConfig = await manager.findOne(LoyaltyConfig, { where: { active: true } });
        if (loyaltyConfig && Number(loyaltyConfig.points_per_rupee) > 0) {
          const points_to_deduct = parseFloat((Number(data.total_return_amount) * Number(loyaltyConfig.points_per_rupee)).toFixed(2));
          if (points_to_deduct > 0) {
            customer.loyalty_points = (Number(customer.loyalty_points) || 0) - points_to_deduct;
            customer.loyalty_points_balance = (Number(customer.loyalty_points_balance) || 0) - points_to_deduct;
            
            const history = manager.create(LoyaltyHistory, {
              customer_id: customer.id,
              points: -points_to_deduct,
              type: LoyaltyTransactionType.ADJUSTMENT,
              notes: `Deduction for sales return ${retNum}`,
              reference_id: savedReturn.id
            });
            await manager.save(history);
          }
        }

        // Revert redeemed points if applicable
        if (invoice && Number(invoice.loyalty_points_redeemed) > 0) {
          const totalInvBeforeRedemption = Number(invoice.net_payable) + Number(invoice.loyalty_redemption_amount);
          if (totalInvBeforeRedemption > 0) {
            const points_to_revert = parseFloat(((Number(data.total_return_amount) / totalInvBeforeRedemption) * Number(invoice.loyalty_points_redeemed)).toFixed(2));
            if (points_to_revert > 0) {
              customer.loyalty_points_balance = (Number(customer.loyalty_points_balance) || 0) + points_to_revert;
              
              const revertHistory = manager.create(LoyaltyHistory, {
                customer_id: customer.id,
                points: points_to_revert,
                type: LoyaltyTransactionType.ADJUSTMENT,
                notes: `Reversed redeemed points for sales return ${retNum}`,
                reference_id: savedReturn.id
              });
              await manager.save(revertHistory);
            }
          }
        }

        await manager.save(customer);

        // Calculate Excess Payment for Credit Coupon
        const returnAmount = Number(data.total_return_amount);
        let refundAmount = 0;
        
        if (invoice) {
          if (Number(invoice.amount_pending) >= returnAmount) {
            invoice.amount_pending = Number(invoice.amount_pending) - returnAmount;
          } else {
            refundAmount = returnAmount - Number(invoice.amount_pending);
            invoice.amount_pending = 0;
          }
          
          if (Number(invoice.amount_pending) <= 0) {
            invoice.payment_status = 'paid';
          }

          await manager.save(SalesInvoice, invoice);

          if (refundAmount > 0) {
            const { creditCouponService } = require('./creditCoupon.service');
            const coupon = await creditCouponService.generate({
              amount: refundAmount,
              customer_mobile: data.customer_mobile,
              return_id: savedReturn.id
            }, manager);
            
            savedReturn.credit_coupon_no = coupon.coupon_no;
            await manager.save(SalesReturn, savedReturn);
          }
        }
      }

      return savedReturn;
    });
  }

  // Credit Notes
  async getCreditNotes(filters: { customer_mobile?: string; status?: string }) {
    const where: any = {};
    if (filters.customer_mobile) where.customer_mobile = filters.customer_mobile;
    if (filters.status) where.status = filters.status;
    return this.cnRepo.find({ where, order: { credit_date: 'DESC' } });
  }

  async applyCreditNote(creditNoteId: string, invoiceId: string, amount: number) {
    return AppDataSource.transaction(async (manager) => {
      const cn = await manager.findOne(CreditNote, { where: { id: creditNoteId } });
      if (!cn) throw new Error('Credit note not found');
      if (Number(cn.balance_remaining) < amount) throw new Error('Insufficient credit note balance');

      const newBalance = Number(cn.balance_remaining) - amount;
      cn.balance_used = Number(cn.balance_used) + amount;
      cn.balance_remaining = newBalance;
      cn.status = newBalance === 0 ? 'fully_used' : 'partially_used';
      await manager.save(cn);

      const application = manager.create(CreditNoteApplication, {
        credit_note_id: creditNoteId,
        invoice_id: invoiceId,
        amount_applied: amount,
      });
      await manager.save(application);

      const customer = await manager.findOne(Customer, { where: { mobile: cn.customer_mobile! } });
      if (customer) {
        customer.credit_balance = Number(customer.credit_balance) - amount;
        await manager.save(customer);
      }

      return { creditNoteId, invoiceId, amountApplied: amount, newBalance, newStatus: cn.status };
    });
  }
  async getReturnItems(filters: any) {
    const qb = AppDataSource.getRepository(SalesReturnItem).createQueryBuilder('sri')
      .leftJoinAndSelect('sri.salesman', 'salesman')
      .leftJoinAndSelect('sri.product_item', 'product_item')
      .leftJoinAndSelect('product_item.product_group', 'product_group');

    if (filters.return_id) {
      const ids = String(filters.return_id).split(',');
      if (ids.length > 1) {
        qb.andWhere('sri.return_id IN (:...returnIds)', { returnIds: ids });
      } else {
        qb.andWhere('sri.return_id = :returnId', { returnId: ids[0] });
      }
    }

    qb.orderBy('sri.created_at', 'ASC');
    return qb.getMany();
  }
}

export const salesReturnService = new SalesReturnService();
