import { AppDataSource } from '../config/data-source';
import { SalesReturn } from '../entities/SalesReturn';
import { SalesReturnItem } from '../entities/SalesReturnItem';
import { SalesInvoice } from '../entities/SalesInvoice';
import { CreditNote } from '../entities/CreditNote';
import { CreditNoteApplication } from '../entities/CreditNoteApplication';
import { BarcodeBatch } from '../entities/BarcodeBatch';
import { Customer, LoyaltyConfig, LoyaltyHistory, LoyaltyTransactionType } from '../entities';
import { ILike, In } from 'typeorm';
import { CreditCoupon } from '../entities/CreditCoupon';
import { creditCouponService } from './creditCoupon.service';
import { getFiscalYearPrefix } from '../utils/fiscalYear';

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
      let retNum = data.return_number;
      if (!retNum) {
        const prefix = `SRET${getFiscalYearPrefix()}`;
        const records = await manager.query(`SELECT return_number FROM sales_returns WHERE return_number LIKE $1 ORDER BY return_number DESC LIMIT 1`, [`${prefix}%`]);
        let nextNum = 1;
        if (records.length > 0 && records[0].return_number) {
          const lastPortion = records[0].return_number.substring(prefix.length);
          const parsed = parseInt(lastPortion, 10);
          if (!isNaN(parsed)) nextNum = parsed + 1;
        }
        retNum = `${prefix}${nextNum.toString().padStart(6, '0')}`;
      }

      const ret = manager.create(SalesReturn, {
        return_number: retNum,
        return_date: data.return_date,
        invoice_id: data.invoice_id,
        invoice_number: data.invoice_number,
        customer_mobile: data.customer_mobile,
        customer_name: data.customer_name,
        return_reason: data.return_reason,
        total_return_amount: data.total_return_amount,
        total_discount_amount: data.total_discount_amount || 0,
        total_loyalty_amount: data.total_loyalty_amount || 0,
        additional_charges_returned: data.additional_charges_returned || 0,
        additional_charges_gst_returned: data.additional_charges_gst_returned || 0,
        additional_charges_total_returned: data.additional_charges_total_returned || 0,
        status: 'completed',
        created_by: userId,
        salesman_id: data.salesman_id || null,
      });
      const savedReturn = await manager.save(ret);

      // Create return items & restore inventory
      let returnAmountApproval = 0;
      let returnAmountRegular = 0;

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
          discount_amount: item.discount_amount || 0,
          loyalty_amount: item.loyalty_amount || 0,
          reason: item.reason || null,
          salesman_id: item.salesman_id || null,
          on_approval: !!item.on_approval,
        });
        await manager.save(retItem);

        const itemAmt = Number(item.return_amount) || 0;
        if (item.on_approval) {
          returnAmountApproval += itemAmt;
        } else {
          returnAmountRegular += itemAmt;
        }

        // Restore inventory — cap available at total to prevent available > total
        const batch = await manager.findOne(BarcodeBatch, { where: { barcode_alias_8digit: item.barcode_8digit } });
        if (batch) {
          batch.available_quantity = Math.min(
            batch.total_quantity,
            batch.available_quantity + (item.quantity || 1)
          );
          await manager.save(batch);
        }
      }

      // Create credit note
      // ... (existing CN logic remains same)
      let cnNum = data.credit_note_number;
      if (!cnNum) {
        const prefix = `CN${getFiscalYearPrefix()}`;
        const records = await manager.query(`SELECT credit_note_number FROM credit_notes WHERE credit_note_number LIKE $1 ORDER BY credit_note_number DESC LIMIT 1`, [`${prefix}%`]);
        let nextNum = 1;
        if (records.length > 0 && records[0].credit_note_number) {
          const lastPortion = records[0].credit_note_number.substring(prefix.length);
          const parsed = parseInt(lastPortion, 10);
          if (!isNaN(parsed)) nextNum = parsed + 1;
        }
        cnNum = `${prefix}${nextNum.toString().padStart(6, '0')}`;
      }
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

        const invoice = await manager.findOne(SalesInvoice, { 
          where: { id: data.invoice_id },
          relations: ['items']
        });
        
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
        let refundAmount = 0;
        
        if (invoice) {
          const initialPending = Number(invoice.amount_pending);
          let currentPending = initialPending;

          const totalRegularValue = invoice.items
            .filter(i => !i.on_approval)
            .reduce((sum, i) => {
              const itemTotal = Number(i.total_value) || (Number(i.selling_price || i.mrp) * Number(i.quantity));
              return sum + itemTotal;
            }, 0);
          
          const totalItemsValue = invoice.items.reduce((sum, item) => {
            const itemTotal = Number(item.total_value) || (Number(item.selling_price || item.mrp || 0) * Number(item.quantity || 1));
            return sum + itemTotal;
          }, 0);
          const effectiveSubtotal = Number(invoice.total_mrp) || totalItemsValue;
          
          // Deduce true net payable to handle cases where recorded net_payable is inaccurate
          const totalDiscounts = Number(invoice.total_discount || 0) + Number(invoice.voucher_discount || 0) + Number(invoice.special_discount || 0);
          const actualNetPayable = Math.min(Number(invoice.net_payable), Math.max(0, effectiveSubtotal - totalDiscounts - Number(invoice.loyalty_redemption_amount || 0)));
          
          const invoiceRatio = effectiveSubtotal > 0 ? (actualNetPayable / effectiveSubtotal) : 1;
          
          const adjustedRegularValue = totalRegularValue * invoiceRatio;
          const regularPending = Math.max(0, adjustedRegularValue - Number(invoice.amount_paid));

          // 2. Handle Approval Returns: Offset against total pending first
          const offsetFromApproval = Math.min(currentPending, returnAmountApproval);
          currentPending -= offsetFromApproval;
          refundAmount += (returnAmountApproval - offsetFromApproval);

          // 3. Handle Regular Returns: Offset against regularPending portion first
          const offsetFromRegular = Math.min(regularPending, returnAmountRegular);
          currentPending -= offsetFromRegular;
          refundAmount += (returnAmountRegular - offsetFromRegular);

          invoice.amount_pending = currentPending;
          invoice.net_payable = Number(invoice.net_payable) - Number(data.total_return_amount);
          invoice.amount_paid = Number(invoice.amount_paid) - refundAmount;

          if (Number(invoice.amount_pending) <= 0) {
            invoice.payment_status = 'paid';
          } else if (Number(invoice.amount_paid) > 0) {
            invoice.payment_status = 'partial';
          } else {
            invoice.payment_status = 'pending';
          }

          await manager.save(SalesInvoice, invoice);

          if (refundAmount > 0) {
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

  async update(id: string, data: any, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      const oldReturn = await manager.findOne(SalesReturn, { 
        where: { id }, 
        relations: ['items', 'invoice', 'invoice.items'] 
      });
      if (!oldReturn) throw new Error('Sales return not found');

      // 1. Safety Check: If a credit coupon was generated and redeemed, block edit
      if (oldReturn.credit_coupon_no) {
        const coupon = await manager.findOne(CreditCoupon, { where: { coupon_no: oldReturn.credit_coupon_no } });
        if (coupon && coupon.status === 'redeemed') {
          throw new Error('This return cannot be edited because the associated Credit Coupon has already been redeemed.');
        }
        // If coupon exists and is active, we will delete/replace it
        if (coupon) await manager.remove(CreditCoupon, coupon);
      }

      // 2. Reversal Logic
      // 2a. Revert Inventory
      for (const oldItem of oldReturn.items) {
        const batch = await manager.findOne(BarcodeBatch, { where: { barcode_alias_8digit: oldItem.barcode_8digit } });
        if (batch) {
          batch.available_quantity = Math.max(0, batch.available_quantity - (oldItem.quantity || 1));
          await manager.save(batch);
        }
      }

      // 2b. Revert Customer Balance & Loyalty
      const customer = await manager.findOne(Customer, { where: { mobile: oldReturn.customer_mobile } });
      if (customer) {
        customer.credit_balance = Number(customer.credit_balance) - Number(oldReturn.total_return_amount);
        customer.total_returns = Number(customer.total_returns) - Number(oldReturn.total_return_amount);
        customer.return_count = Math.max(0, (customer.return_count || 0) - 1);

        // Delete Loyalty adjustments related to this return
        await manager.delete(LoyaltyHistory, { reference_id: oldReturn.id });
        
        // Note: For simplicity, we don't perfectly re-sum loyalty from history here, 
        // we'll let the re-application step (Step 3) calculate and apply the new state.
        // However, we should ideally revert the loyalty_points_balance.
        // Let's assume the re-application logic will handle it by re-deducing/re-reverting.
        // To be safe, let's actually fetch all history and re-sum if needed, 
        // OR just revert the specific points based on the oldReturn.total_return_amount.
        
        const loyaltyConfig = await manager.findOne(LoyaltyConfig, { where: { active: true } });
        if (loyaltyConfig && Number(loyaltyConfig.points_per_rupee) > 0) {
          const oldPointsDeducted = parseFloat((Number(oldReturn.total_return_amount) * Number(loyaltyConfig.points_per_rupee)).toFixed(2));
          customer.loyalty_points = (Number(customer.loyalty_points) || 0) + oldPointsDeducted;
          customer.loyalty_points_balance = (Number(customer.loyalty_points_balance) || 0) + oldPointsDeducted;
        }

        // Revert redeemed points reversal if applicable
        if (oldReturn.invoice && Number(oldReturn.invoice.loyalty_points_redeemed) > 0) {
          const totalInvBeforeRedemption = Number(oldReturn.invoice.net_payable) + Number(oldReturn.total_return_amount) + Number(oldReturn.invoice.loyalty_redemption_amount);
          if (totalInvBeforeRedemption > 0) {
            const pointsReverted = parseFloat(((Number(oldReturn.total_return_amount) / totalInvBeforeRedemption) * Number(oldReturn.invoice.loyalty_points_redeemed)).toFixed(2));
            customer.loyalty_points_balance = (Number(customer.loyalty_points_balance) || 0) - pointsReverted;
          }
        }
        await manager.save(customer);
      }

      // 2c. Revert Invoice Totals
      if (oldReturn.invoice) {
        const inv = oldReturn.invoice;
        let oldRefundAmount = 0;
        if (oldReturn.credit_coupon_no) {
          const coupon = await manager.findOne(CreditCoupon, { 
            where: { coupon_no: oldReturn.credit_coupon_no },
            withDeleted: true
          });
          oldRefundAmount = Number(coupon?.amount || 0);
        }
        
        // Formulas:
        // OldNet = NewNet + ReturnTotal
        // OldPaid = NewPaid + RefundAmount
        // OldPending = NewPending + (ReturnTotal - RefundAmount)
        inv.net_payable = Number(inv.net_payable) + Number(oldReturn.total_return_amount);
        inv.amount_paid = Number(inv.amount_paid) + Number(oldRefundAmount);
        inv.amount_pending = Number(inv.amount_pending) + (Number(oldReturn.total_return_amount) - Number(oldRefundAmount));
        
        if (Number(inv.amount_pending) <= 0) inv.payment_status = 'paid';
        else if (Number(inv.amount_paid) > 0) inv.payment_status = 'partial';
        else inv.payment_status = 'pending';
        
        await manager.save(SalesInvoice, inv);
      }

      // 2d. Remove Old Items, Credit Note
      await manager.delete(SalesReturnItem, { return_id: oldReturn.id });
      await manager.delete(CreditNote, { return_id: oldReturn.id });

      // 3. Apply New Return (Re-using logic from create)
      oldReturn.return_date = data.return_date || oldReturn.return_date;
      oldReturn.return_reason = data.return_reason || oldReturn.return_reason;
      oldReturn.total_return_amount = data.total_return_amount;
      oldReturn.total_discount_amount = data.total_discount_amount || 0;
      oldReturn.total_loyalty_amount = data.total_loyalty_amount || 0;
      oldReturn.additional_charges_returned = data.additional_charges_returned || 0;
      oldReturn.additional_charges_gst_returned = data.additional_charges_gst_returned || 0;
      oldReturn.additional_charges_total_returned = data.additional_charges_total_returned || 0;
      oldReturn.salesman_id = data.salesman_id || oldReturn.salesman_id;
      oldReturn.credit_coupon_no = undefined as any; // Reset for potential new generation

      const savedReturn = await manager.save(oldReturn);

      let returnAmountApproval = 0;
      let returnAmountRegular = 0;

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
          discount_amount: item.discount_amount || 0,
          loyalty_amount: item.loyalty_amount || 0,
          reason: item.reason || null,
          salesman_id: item.salesman_id || null,
          on_approval: !!item.on_approval,
        });
        await manager.save(retItem);

        const itemAmt = Number(item.return_amount) || 0;
        if (item.on_approval) {
          returnAmountApproval += itemAmt;
        } else {
          returnAmountRegular += itemAmt;
        }

        const batch = await manager.findOne(BarcodeBatch, { where: { barcode_alias_8digit: item.barcode_8digit } });
        if (batch) {
          batch.available_quantity = Math.min(batch.total_quantity, batch.available_quantity + (item.quantity || 1));
          await manager.save(batch);
        }
      }

      // Re-generate Credit Note
      const prefix = `CN${getFiscalYearPrefix()}`;
      const records = await manager.query(`SELECT credit_note_number FROM credit_notes WHERE credit_note_number LIKE $1 ORDER BY credit_note_number DESC LIMIT 1`, [`${prefix}%`]);
      let nextNum = 1;
      if (records.length > 0 && records[0].credit_note_number) {
        const lastPortion = records[0].credit_note_number.substring(prefix.length);
        const parsed = parseInt(lastPortion, 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      const cnNum = `${prefix}${nextNum.toString().padStart(6, '0')}`;

      const cn = manager.create(CreditNote, {
        credit_note_number: cnNum,
        credit_date: savedReturn.return_date,
        customer_mobile: savedReturn.customer_mobile,
        customer_name: savedReturn.customer_name,
        return_id: savedReturn.id,
        invoice_id: savedReturn.invoice_id,
        credit_amount: savedReturn.total_return_amount,
        balance_remaining: savedReturn.total_return_amount,
        status: 'active',
        created_by: userId,
      });
      await manager.save(cn);

      // Re-apply Customer & Invoice changes
      const updatedCustomer = await manager.findOne(Customer, { where: { mobile: savedReturn.customer_mobile } });
      if (updatedCustomer) {
        updatedCustomer.credit_balance = Number(updatedCustomer.credit_balance) + Number(data.total_return_amount);
        updatedCustomer.total_returns = Number(updatedCustomer.total_returns) + Number(data.total_return_amount);
        updatedCustomer.return_count = (updatedCustomer.return_count || 0) + 1;

        const invoice = await manager.findOne(SalesInvoice, { 
          where: { id: savedReturn.invoice_id },
          relations: ['items']
        });

        // Loyalty Logic (Fresh Application)
        const loyaltyConfig = await manager.findOne(LoyaltyConfig, { where: { active: true } });
        if (loyaltyConfig && Number(loyaltyConfig.points_per_rupee) > 0) {
          const points_to_deduct = parseFloat((Number(data.total_return_amount) * Number(loyaltyConfig.points_per_rupee)).toFixed(2));
          if (points_to_deduct > 0) {
            updatedCustomer.loyalty_points = (Number(updatedCustomer.loyalty_points) || 0) - points_to_deduct;
            updatedCustomer.loyalty_points_balance = (Number(updatedCustomer.loyalty_points_balance) || 0) - points_to_deduct;
            await manager.save(manager.create(LoyaltyHistory, {
              customer_id: updatedCustomer.id,
              points: -points_to_deduct,
              type: LoyaltyTransactionType.ADJUSTMENT,
              notes: `Adjustment for updated sales return ${savedReturn.return_number}`,
              reference_id: savedReturn.id
            }));
          }
        }

        if (invoice && Number(invoice.loyalty_points_redeemed) > 0) {
          const totalInvBeforeRedemption = Number(invoice.net_payable) + Number(invoice.loyalty_redemption_amount);
          if (totalInvBeforeRedemption > 0) {
            const points_to_revert = parseFloat(((Number(data.total_return_amount) / totalInvBeforeRedemption) * Number(invoice.loyalty_points_redeemed)).toFixed(2));
            if (points_to_revert > 0) {
              updatedCustomer.loyalty_points_balance = (Number(updatedCustomer.loyalty_points_balance) || 0) + points_to_revert;
              await manager.save(manager.create(LoyaltyHistory, {
                customer_id: updatedCustomer.id,
                points: points_to_revert,
                type: LoyaltyTransactionType.ADJUSTMENT,
                notes: `Reversed redeemed points for updated sales return ${savedReturn.return_number}`,
                reference_id: savedReturn.id
              }));
            }
          }
        }
        await manager.save(updatedCustomer);

        // Invoice Balance Recalculation (Fresh Application)
        if (invoice) {
          let refundAmount = 0;
          let currentPending = Number(invoice.amount_pending);

          const totalItemsValue = invoice.items.reduce((sum, item) => sum + (Number(item.total_value) || (Number(item.selling_price || item.mrp || 0) * Number(item.quantity || 1))), 0);
          const effectiveSubtotal = Number(invoice.total_mrp) || totalItemsValue;
          const totalDiscounts = Number(invoice.total_discount || 0) + Number(invoice.voucher_discount || 0) + Number(invoice.special_discount || 0);
          const actualNetPayable = Math.min(Number(invoice.net_payable), Math.max(0, effectiveSubtotal - totalDiscounts - Number(invoice.loyalty_redemption_amount || 0)));
          const invoiceRatio = effectiveSubtotal > 0 ? (actualNetPayable / effectiveSubtotal) : 1;
          
          const totalRegularValue = invoice.items.filter(i => !i.on_approval).reduce((sum, i) => sum + (Number(i.total_value) || (Number(i.selling_price || i.mrp) * Number(i.quantity))), 0);
          const adjustedRegularValue = totalRegularValue * invoiceRatio;
          const regularPending = Math.max(0, adjustedRegularValue - Number(invoice.amount_paid));

          const offsetFromApproval = Math.min(currentPending, returnAmountApproval);
          currentPending -= offsetFromApproval;
          refundAmount += (returnAmountApproval - offsetFromApproval);

          const offsetFromRegular = Math.min(regularPending, returnAmountRegular);
          currentPending -= offsetFromRegular;
          refundAmount += (returnAmountRegular - offsetFromRegular);

          invoice.amount_pending = currentPending;
          invoice.net_payable = Number(invoice.net_payable) - Number(data.total_return_amount);
          invoice.amount_paid = Number(invoice.amount_paid) - refundAmount;

          if (Number(invoice.amount_pending) <= 0) invoice.payment_status = 'paid';
          else if (Number(invoice.amount_paid) > 0) invoice.payment_status = 'partial';
          else invoice.payment_status = 'pending';

          await manager.save(SalesInvoice, invoice);

          if (refundAmount > 0) {
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
