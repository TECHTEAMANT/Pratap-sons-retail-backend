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

      let invoiceId = data.invoice_id;
      if (!invoiceId && data.invoice_number) {
        const inv = await manager.findOne(SalesInvoice, { where: { invoice_number: data.invoice_number } });
        if (inv) invoiceId = inv.id;
      }

      const ret = manager.create(SalesReturn, {
        return_number: retNum,
        return_date: data.return_date,
        invoice_id: invoiceId,
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
      const createdItems: SalesReturnItem[] = [];

      for (const item of data.items) {
        const retItem = manager.create(SalesReturnItem, {
          salesReturn: savedReturn,
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
        const savedItem = await manager.save(SalesReturnItem, retItem);
        createdItems.push(savedItem);

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
      savedReturn.items = createdItems;

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
        credit_amount: 0, // Will be updated after refundAmount is calculated
        balance_remaining: 0, // Will be updated after refundAmount is calculated
        status: 'active',
        created_by: userId,
      });
      await manager.save(cn);

      // Update customer credit balance
      const customer = await manager.findOne(Customer, { where: { mobile: data.customer_mobile } });
      if (customer) {
        // 3. Update Customer History (Credit balance increases ONLY by refund value, handled later)
        customer.total_returns = Number(customer.total_returns) + Number(data.total_return_amount);
        customer.return_count = (customer.return_count || 0) + 1;
        await manager.save(Customer, customer);

        const invoice = await manager.findOne(SalesInvoice, { 
          where: { id: data.invoice_id },
          relations: ['items', 'receipt_items', 'coupon_applications', 'credit_note_applications', 'advance_applications']
        });
        
        if (invoice) {
          // 4. RECALCULATE GROUND TRUTH for the invoice before applying return
          const trueTotalMrp = (invoice.items || []).reduce((sum, i) => sum + (Number(i.mrp || 0) * Number(i.quantity || 1)), 0);
          const itemSum = (invoice.items || []).reduce((sum, i) => sum + (Number(i.discount || 0) * Number(i.quantity || 1)), 0);
          
          const headerSum = Number(invoice.special_discount || 0) + 
                            Number(invoice.loyalty_redemption_amount || 0) + 
                            Number(invoice.voucher_discount || 0);

          const finalDiscount = Math.max(Math.round(itemSum), Math.round(headerSum));
          
          const trueNetPayable = Math.round(Math.max(0, 
            trueTotalMrp 
            - finalDiscount 
            - Number(invoice.coupon_amount || 0)
            + Number(invoice.additional_charges_total || 0)
          ));

          // Payment Ground Truth: Sum EVERYTHING that reduced the balance
          const receiptPaid = (invoice.receipt_items || []).reduce((sum, ri) => sum + Number(ri.amount_paid || 0), 0);
          const advancesPaid = (invoice.advance_applications || []).reduce((sum, aa) => sum + Number(aa.amount_applied || 0), 0);
          const couponsApplied = (invoice.coupon_applications || []).reduce((sum, ca) => sum + Number(ca.amount_applied || 0), 0);
          const creditNotesApplied = (invoice.credit_note_applications || []).reduce((sum, cna) => sum + Number(cna.amount_applied || 0), 0);
          
          let directPaid = 0;
          const pd = typeof invoice.payment_details === 'string' ? JSON.parse(invoice.payment_details) : invoice.payment_details;
          if (Array.isArray(pd)) {
            directPaid = pd.reduce((sum: number, p: any) => {
              const mode = (p.mode || '').toString().toUpperCase();
              if (mode.includes('APPROVAL')) return sum;
              return sum + (Number(p.amount || 0));
            }, 0);
          } else if (pd && typeof pd === 'object') {
            directPaid = Object.entries(pd).reduce((sum: number, [key, val]: [string, any]) => {
              const mode = key.toUpperCase();
              if (mode.includes('APPROVAL')) return sum;
              return sum + (Number(val) || 0);
            }, 0);
          }

          const trueAmountPaid = receiptPaid + directPaid + advancesPaid + couponsApplied + creditNotesApplied;
          const trueAmountPending = Math.max(0, trueNetPayable - trueAmountPaid);

          // Use these True values for the invoice state
          invoice.net_payable = trueNetPayable;
          invoice.amount_paid = trueAmountPaid;
          invoice.amount_pending = trueAmountPending;
          
          // 4.1 Deduct loyalty points earned
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

          // 4.2 Revert redeemed points if applicable
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

          // 5. Calculate Return impact
          let itemBasedReturnTotal = 0;
          if (Array.isArray(data.items)) {
            for (const item of data.items) {
              itemBasedReturnTotal += Number(item.return_amount) || 0;
            }
          }
          itemBasedReturnTotal += Number(data.additional_charges_total_returned || 0);

          const returnAmount = itemBasedReturnTotal;
          // Only reduce pending by the amount that was actually owed (using True Pending)
          const amountToReducePending = Math.min(Number(invoice.amount_pending), returnAmount);
          
          // CRITICAL FINANCIAL CAP: Credit coupon (refund) should ONLY be the leftover amount 
          // AFTER pending is wiped, AND it MUST NOT exceed the actual amount paid (True Amount Paid).
          const rawRefundAmount = Math.max(0, returnAmount - amountToReducePending);
          const refundAmount = Math.min(Number(invoice.amount_paid), rawRefundAmount);

          invoice.amount_pending = Math.max(0, Number(invoice.amount_pending) - amountToReducePending);
          invoice.amount_paid = Math.max(0, Number(invoice.amount_paid) - refundAmount); 
          invoice.net_payable = Math.max(0, Number(invoice.net_payable) - returnAmount);

          if (Number(invoice.net_payable) <= 0.05) {
            invoice.payment_status = 'returned';
          } else if (Number(invoice.amount_pending) <= 0.05) {
            invoice.payment_status = 'paid';
          } else if (Number(invoice.amount_paid) > 0.01) {
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

          if (cn) {
            cn.credit_amount = refundAmount;
            cn.balance_remaining = refundAmount;
            await manager.save(cn);
          }

          if (refundAmount > 0 && !savedReturn.credit_coupon_no) {
            customer.credit_balance = Number(customer.credit_balance || 0) + refundAmount;
            await manager.save(customer);
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

      if (oldReturn.credit_coupon_no) {
        const coupon = await manager.findOne(CreditCoupon, { where: { coupon_no: oldReturn.credit_coupon_no } });
        if (coupon && coupon.status === 'redeemed') {
          throw new Error('This return cannot be edited because the associated Credit Coupon has already been redeemed.');
        }
        if (coupon) await manager.remove(CreditCoupon, coupon);
      }

      for (const oldItem of oldReturn.items) {
        const batch = await manager.findOne(BarcodeBatch, { where: { barcode_alias_8digit: oldItem.barcode_8digit } });
        if (batch) {
          batch.available_quantity = Math.max(0, batch.available_quantity - (oldItem.quantity || 1));
          await manager.save(batch);
        }
      }

      const customer = await manager.findOne(Customer, { where: { mobile: oldReturn.customer_mobile } });
      if (customer) {
        customer.total_returns = Number(customer.total_returns) - Number(oldReturn.total_return_amount);
        customer.return_count = Math.max(0, (customer.return_count || 0) - 1);
        await manager.delete(LoyaltyHistory, { reference_id: oldReturn.id });
        
        const loyaltyConfig = await manager.findOne(LoyaltyConfig, { where: { active: true } });
        if (loyaltyConfig && Number(loyaltyConfig.points_per_rupee) > 0) {
          const oldPointsDeducted = parseFloat((Number(oldReturn.total_return_amount) * Number(loyaltyConfig.points_per_rupee)).toFixed(2));
          customer.loyalty_points = (Number(customer.loyalty_points) || 0) + oldPointsDeducted;
          customer.loyalty_points_balance = (Number(customer.loyalty_points_balance) || 0) + oldPointsDeducted;
        }

        if (oldReturn.invoice && Number(oldReturn.invoice.loyalty_points_redeemed) > 0) {
          const totalInvBeforeRedemption = Number(oldReturn.invoice.net_payable) + Number(oldReturn.total_return_amount) + Number(oldReturn.invoice.loyalty_redemption_amount);
          if (totalInvBeforeRedemption > 0) {
            const pointsReverted = parseFloat(((Number(oldReturn.total_return_amount) / totalInvBeforeRedemption) * Number(oldReturn.invoice.loyalty_points_redeemed)).toFixed(2));
            customer.loyalty_points_balance = (Number(customer.loyalty_points_balance) || 0) - pointsReverted;
          }
        }
        await manager.save(customer);
      }

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
        
        inv.net_payable = Number(inv.net_payable) + Number(oldReturn.total_return_amount);
        inv.amount_paid = Number(inv.amount_paid) + Number(oldRefundAmount);
        inv.amount_pending = Number(inv.amount_pending) + (Number(oldReturn.total_return_amount) - Number(oldRefundAmount));
        
        if (Number(inv.amount_pending) <= 0) inv.payment_status = 'paid';
        else if (Number(inv.amount_paid) > 0) inv.payment_status = 'partial';
        else inv.payment_status = 'pending';
        
        await manager.save(SalesInvoice, inv);
      }

      await manager.delete(SalesReturnItem, { salesReturn: { id: oldReturn.id } });
      await manager.delete(CreditNote, { return_id: oldReturn.id });

      oldReturn.return_date = data.return_date || oldReturn.return_date;
      oldReturn.return_reason = data.return_reason || oldReturn.return_reason;
      oldReturn.total_return_amount = data.total_return_amount;
      oldReturn.total_discount_amount = data.total_discount_amount || 0;
      oldReturn.total_loyalty_amount = data.total_loyalty_amount || 0;
      oldReturn.additional_charges_returned = data.additional_charges_returned || 0;
      oldReturn.additional_charges_gst_returned = data.additional_charges_gst_returned || 0;
      oldReturn.additional_charges_total_returned = data.additional_charges_total_returned || 0;
      oldReturn.salesman_id = data.salesman_id || oldReturn.salesman_id;
      oldReturn.items = []; 
      oldReturn.credit_coupon_no = null as any; 
      const savedReturn = await manager.save(oldReturn);

      const createdItems: SalesReturnItem[] = [];
      for (const item of data.items) {
        const retItem = manager.create(SalesReturnItem, {
          salesReturn: savedReturn,
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
        const savedItem = await manager.save(SalesReturnItem, retItem);
        createdItems.push(savedItem);

        const batch = await manager.findOne(BarcodeBatch, { where: { barcode_alias_8digit: item.barcode_8digit } });
        if (batch) {
          batch.available_quantity = Math.min(batch.total_quantity, batch.available_quantity + (item.quantity || 1));
          await manager.save(batch);
        }
      }
      savedReturn.items = createdItems;

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
        credit_amount: 0,
        balance_remaining: 0,
        status: 'active',
        created_by: userId,
      });
      await manager.save(cn);

      const updatedCustomer = await manager.findOne(Customer, { where: { mobile: savedReturn.customer_mobile } });
      if (updatedCustomer) {
        updatedCustomer.total_returns = Number(updatedCustomer.total_returns) + Number(data.total_return_amount);
        updatedCustomer.return_count = (updatedCustomer.return_count || 0) + 1;

        const invoice = await manager.findOne(SalesInvoice, { 
          where: { id: savedReturn.invoice_id },
          relations: ['items', 'receipt_items', 'coupon_applications', 'credit_note_applications', 'advance_applications']
        });
        
        if (invoice) {
          // 4. RECALCULATE GROUND TRUTH for the invoice before applying return update
          const trueTotalMrp = (invoice.items || []).reduce((sum, i) => sum + (Number(i.mrp || 0) * Number(i.quantity || 1)), 0);
          const itemSum = (invoice.items || []).reduce((sum, i) => sum + (Number(i.discount || 0) * Number(i.quantity || 1)), 0);
          
          const headerSum = Number(invoice.special_discount || 0) + 
                            Number(invoice.loyalty_redemption_amount || 0) + 
                            Number(invoice.voucher_discount || 0);

          const finalDiscount = Math.max(Math.round(itemSum), Math.round(headerSum));
          
          const trueNetPayable = Math.round(Math.max(0, 
            trueTotalMrp 
            - finalDiscount 
            - Number(invoice.coupon_amount || 0)
            + Number(invoice.additional_charges_total || 0)
          ));

          // Payment Ground Truth: Sum EVERYTHING that reduced the balance
          const receiptPaid = (invoice.receipt_items || []).reduce((sum, ri) => sum + Number(ri.amount_paid || 0), 0);
          const advancesPaid = (invoice.advance_applications || []).reduce((sum, aa) => sum + Number(aa.amount_applied || 0), 0);
          const couponsApplied = (invoice.coupon_applications || []).reduce((sum, ca) => sum + Number(ca.amount_applied || 0), 0);
          const creditNotesApplied = (invoice.credit_note_applications || []).reduce((sum, cna) => sum + Number(cna.amount_applied || 0), 0);
          
          let directPaid = 0;
          const pd = typeof invoice.payment_details === 'string' ? JSON.parse(invoice.payment_details) : invoice.payment_details;
          if (Array.isArray(pd)) {
            directPaid = pd.reduce((sum: number, p: any) => {
              const mode = (p.mode || '').toString().toUpperCase();
              if (mode.includes('APPROVAL')) return sum;
              return sum + (Number(p.amount || 0));
            }, 0);
          } else if (pd && typeof pd === 'object') {
            directPaid = Object.entries(pd).reduce((sum: number, [key, val]: [string, any]) => {
              const mode = key.toUpperCase();
              if (mode.includes('APPROVAL')) return sum;
              return sum + (Number(val) || 0);
            }, 0);
          }

          const trueAmountPaid = receiptPaid + directPaid + advancesPaid + couponsApplied + creditNotesApplied;
          const trueAmountPending = Math.max(0, trueNetPayable - trueAmountPaid);

          // Use these True values for the invoice state
          invoice.net_payable = trueNetPayable;
          invoice.amount_paid = trueAmountPaid;
          invoice.amount_pending = trueAmountPending;

          await manager.save(SalesInvoice, invoice);

          // Loyalty Application
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

          // Balance Application
          const returnAmount = Number(data.total_return_amount);
          const amountToReducePending = Math.min(Number(invoice.amount_pending), returnAmount);
          const rawRefundAmount = Math.max(0, returnAmount - amountToReducePending);
          const refundAmount = Math.min(Number(invoice.amount_paid), rawRefundAmount);

          invoice.amount_pending = Math.max(0, Number(invoice.amount_pending) - amountToReducePending);
          invoice.amount_paid = Math.max(0, Number(invoice.amount_paid) - refundAmount);
          invoice.net_payable = Math.max(0, Number(invoice.net_payable) - returnAmount);

          if (Number(invoice.amount_pending) <= 0.01) {
            invoice.payment_status = 'paid';
          } else if (Number(invoice.amount_paid) > 0.01) {
            invoice.payment_status = 'partial';
          } else {
            invoice.payment_status = 'pending';
          }
          await manager.save(SalesInvoice, invoice);

          // Update the Credit Note to reflect the actual refund value
          if (cn) {
            cn.credit_amount = refundAmount;
            cn.balance_remaining = refundAmount;
            await manager.save(cn);
          }

          if (refundAmount > 0) {
            const coupon = await creditCouponService.generate({
              amount: refundAmount,
              customer_mobile: data.customer_mobile,
              return_id: savedReturn.id
            }, manager);
            savedReturn.credit_coupon_no = coupon.coupon_no;
            await manager.save(SalesReturn, savedReturn);
          } else {
            // No coupon generated, but if a refund exists and no coupon is used, update credit_balance
            if (refundAmount > 0) {
               updatedCustomer.credit_balance = Number(updatedCustomer.credit_balance || 0) + refundAmount;
               await manager.save(updatedCustomer);
            }
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
