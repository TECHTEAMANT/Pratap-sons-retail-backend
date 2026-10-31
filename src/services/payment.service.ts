import { Between, MoreThanOrEqual, LessThanOrEqual, In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { PaymentReceipt } from '../entities/PaymentReceipt';
import { PaymentReceiptItem } from '../entities/PaymentReceiptItem';
import { SalesInvoice } from '../entities/SalesInvoice';
import { CreditCoupon } from '../entities/CreditCoupon';
import { CreditCouponApplication } from '../entities/CreditCouponApplication';
import { creditCouponService } from './creditCoupon.service';

export class PaymentService {
  private repo = AppDataSource.getRepository(PaymentReceipt);

  async findAll(filters: { invoice_id?: string; customer_mobile?: string }) {
    const where: any = {};
    if (filters.invoice_id) {
      if (filters.invoice_id.includes(',')) {
        where.invoice_id = In(filters.invoice_id.split(','));
      } else {
        where.invoice_id = filters.invoice_id;
      }
    }
    if (filters.customer_mobile) where.customer_mobile = filters.customer_mobile;
    return this.repo.find({ 
      where, 
      relations: ['items', 'items.invoice'],
      order: { created_at: 'DESC' } 
    });
  }

  async findOne(id: string) {
    return this.repo.findOne({ 
      where: { id },
      relations: ['items', 'items.invoice']
    });
  }

  async create(data: any, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      // 1. Create the receipt head
      const receipt = manager.create(PaymentReceipt, {
        receipt_number: data.receipt_number,
        receipt_date: data.receipt_date,
        customer_mobile: data.customer_mobile,
        customer_name: data.customer_name,
        customer_gstin: data.customer_gstin || null,
        amount_received: data.amount_received,
        payment_mode: data.payment_mode,
        payment_details: data.payment_details,
        reference_number: data.reference_number,
        notes: data.notes,
        created_by: userId,
      });
      const savedReceipt = await manager.save(receipt);

      // 2. Handle items and update invoice balances
      const savedItems: { invoice_id: string; amount_paid: number }[] = [];
      if (data.items && Array.isArray(data.items)) {
        for (const itemData of data.items) {
          // Update invoice balance
          const invoice = await manager.findOne(SalesInvoice, { where: { id: itemData.invoice_id } });
          let actualToPay = 0;
          if (invoice) {
            // Safety check: Don't allow paying more than pending amount per item to avoid doubling
            const maxAllowed = Math.max(0, Number(invoice.net_payable || 0) - Number(invoice.amount_paid || 0));
            actualToPay = Math.min(Number(itemData.amount_paid || 0), maxAllowed);
            
            invoice.amount_paid = Number(invoice.amount_paid || 0) + actualToPay;
            invoice.amount_pending = Math.max(0, Number(invoice.net_payable || 0) - Number(invoice.amount_paid));
            
            // Accurate status determination
            if (Number(invoice.amount_pending) < 0.01) {
              invoice.payment_status = 'paid';
              invoice.amount_pending = 0; // Clean up floating point
            } else if (Number(invoice.amount_paid) > 0.01) {
              invoice.payment_status = 'partial';
            } else {
              invoice.payment_status = 'pending';
            }
            await manager.save(invoice);
          }

          // Create receipt item with ACTUAL applied amount
          const item = manager.create(PaymentReceiptItem, {
            receipt_id: savedReceipt.id,
            invoice_id: itemData.invoice_id,
            amount_paid: actualToPay,
          });
          await manager.save(item);
          savedItems.push({ invoice_id: itemData.invoice_id, amount_paid: actualToPay });
        }
      }

      // 3. Process any Credit Coupon payments
      const rawDetails = data.payment_details;
      let paymentDetails: any[] = [];
      if (Array.isArray(rawDetails)) {
        paymentDetails = rawDetails;
      } else if (typeof rawDetails === 'string') {
        try { paymentDetails = JSON.parse(rawDetails); } catch { paymentDetails = []; }
      } else if (data.payment_mode) {
        paymentDetails = [{ mode: data.payment_mode, amount: data.amount_received, reference: data.reference_number }];
      }

      for (const pd of paymentDetails) {
        const modeUpper = String(pd.mode || '').trim().toUpperCase();
        const isCouponMode = modeUpper.includes('COUPON') || modeUpper === 'CN' || modeUpper.includes('CREDIT NOTE');
        const couponRef = String(pd.reference || '').trim();
        const couponAmount = Number(pd.amount || 0);

        if (isCouponMode && couponRef && couponAmount > 0) {
          const couponRepo = manager.getRepository(CreditCoupon);
          const coupon = await couponRepo.findOne({ where: { coupon_no: couponRef } });
          if (coupon) {
            let remCoupon = couponAmount;
            for (const sItem of savedItems) {
              if (remCoupon <= 0.001) break;
              if (sItem.amount_paid <= 0) continue;
              const applyToInv = Math.min(remCoupon, sItem.amount_paid);
              await creditCouponService.apply(couponRef, sItem.invoice_id, applyToInv, manager);
              remCoupon -= applyToInv;
            }
            if (remCoupon > 0.001) {
              const fallbackInvId = savedItems[0]?.invoice_id || data.invoice_id;
              if (fallbackInvId) {
                await creditCouponService.apply(couponRef, fallbackInvId, remCoupon, manager);
              }
            }
          }
        }
      }

      return savedReceipt;
    });
  }

  async delete(id: string) {
    return AppDataSource.transaction(async (manager) => {
      const receipt = await manager.findOne(PaymentReceipt, { 
        where: { id },
        relations: ['items', 'items.invoice']
      });
      
      if (!receipt) return null;

      // 1. Reverse balance updates for each item
      if (receipt.items && receipt.items.length > 0) {
        for (const item of receipt.items) {
          const invoice = item.invoice || await manager.findOne(SalesInvoice, { where: { id: item.invoice_id } });
          if (invoice) {
            invoice.amount_paid = Math.max(0, Number(invoice.amount_paid || 0) - Number(item.amount_paid));
            invoice.amount_pending = Math.min(Number(invoice.net_payable || 0), Number(invoice.amount_pending || 0) + Number(item.amount_paid));

            // Accurate status determination
            if (Number(invoice.amount_pending) < 0.01) {
              invoice.payment_status = 'paid';
              invoice.amount_pending = 0; // Clean up floating point
            } else if (Number(invoice.amount_paid) > 0.01) {
              invoice.payment_status = 'partial';
            } else {
              invoice.payment_status = 'pending';
            }
            await manager.save(invoice);
          }
          // 2. Delete the item
          await manager.remove(item);
        }
      }

      // 2. Reverse any Credit Coupon applications made through this receipt
      const rawDetails = receipt.payment_details;
      let paymentDetails: any[] = [];
      if (Array.isArray(rawDetails)) {
        paymentDetails = rawDetails;
      } else if (typeof rawDetails === 'string') {
        try { paymentDetails = JSON.parse(rawDetails); } catch { paymentDetails = []; }
      } else if (receipt.payment_mode) {
        paymentDetails = [{ mode: receipt.payment_mode, amount: receipt.amount_received, reference: receipt.reference_number }];
      }

      for (const pd of paymentDetails) {
        const modeUpper = String(pd.mode || '').trim().toUpperCase();
        const isCouponMode = modeUpper.includes('COUPON') || modeUpper === 'CN' || modeUpper.includes('CREDIT NOTE');
        const couponRef = String(pd.reference || '').trim();
        const couponAmount = Number(pd.amount || 0);

        if (isCouponMode && couponRef && couponAmount > 0) {
          const couponRepo = manager.getRepository(CreditCoupon);
          const appRepo = manager.getRepository(CreditCouponApplication);
          const coupon = await couponRepo.findOne({ where: { coupon_no: couponRef } });
          if (coupon) {
            const apps = await appRepo.find({ where: { coupon_id: coupon.id } });
            let toReverse = couponAmount;
            for (const app of apps) {
              if (toReverse <= 0.001) break;
              const curApplied = Number(app.amount_applied || 0);
              const deduct = Math.min(toReverse, curApplied);
              if (curApplied - deduct <= 0.001) {
                await appRepo.remove(app);
              } else {
                app.amount_applied = curApplied - deduct;
                await appRepo.save(app);
              }
              toReverse -= deduct;
            }

            // Recalculate coupon status
            const [{ used }] = await manager.query(
              `SELECT COALESCE(SUM(amount_applied)::numeric, 0) as used FROM credit_coupon_applications WHERE coupon_id = $1`,
              [coupon.id]
            );
            const [{ refunded }] = await manager.query(
              `SELECT COALESCE(SUM(amount)::numeric, 0) as refunded FROM credit_coupon_refunds WHERE coupon_id = $1`,
              [coupon.id]
            );
            const remaining = Math.max(0, Number(coupon.amount) - Number(used || 0) - Number(refunded || 0));
            coupon.status = remaining <= 0 ? 'redeemed' : 'active';
            coupon.updated_at = new Date();
            await couponRepo.save(coupon);
          }
        }
      }

      // 3. Finally delete the receipt head
      return await manager.remove(receipt);
    });
  }

  /**
   * REPAIR: Recalculates amount_paid for all invoices from ground truth:
   * - Initial billing payment_details (excluding any RCP-mode entries)
   * - Plus sum of all linked payment_receipt_items
   * This fixes the double-counting bug where an RCP entry in payment_details
   * AND a separate PaymentReceipt row were both adding to amount_paid.
   */
  async repairInvoiceBalances(): Promise<{ repaired: number; errors: number; details: string[] }> {
    const invoiceRepo = AppDataSource.getRepository(SalesInvoice);
    const results = { repaired: 0, errors: 0, details: [] as string[] };

    // Get all invoices with their receipts, returns, and wallet applications
    const invoices = await invoiceRepo
      .createQueryBuilder('si')
      .leftJoinAndSelect('si.receipt_items', 'ri')
      .leftJoinAndSelect('ri.receipt', 'r')
      .leftJoinAndSelect('si.sales_returns', 'sr')
      .leftJoinAndSelect('si.coupon_applications', 'ca')
      .leftJoinAndSelect('si.advance_applications', 'aa')
      .leftJoinAndSelect('si.credit_note_applications', 'cna')
      .getMany();

    for (const invoice of invoices) {
      try {
        // 1. Reconstruct TRUE Net Payable (MRP - Final Discount + Charges - Returns)
        // Business Rule: If Item Discounts exist (>0.1), use them. Otherwise, sum header discounts.
        const itemDisc = Number(invoice.total_discount || 0);
        const headerDiscounts = Number(invoice.special_discount || 0) + 
                               Number(invoice.loyalty_redemption_amount || 0) + 
                               Number(invoice.voucher_discount || 0);
        const finalDiscount = (itemDisc > 0.1) ? itemDisc : headerDiscounts;
        
        const returnsAmt = (invoice.sales_returns || []).reduce((sum, r) => sum + Number(r.total_return_amount || 0), 0);
        
        const trueNet = Math.max(0, 
          Number(invoice.total_mrp || 0) 
          - finalDiscount 
          + Number(invoice.additional_charges_total || 0)
          - returnsAmt
        );

        // 2. Sum actual physical PaymentReceipt items (Exclude APPROVAL and wallet modes)
        const receiptPaid = (invoice.receipt_items || []).reduce((s, ri) => {
          const mode = (ri.receipt?.payment_mode || '').toString().toUpperCase();
          if (mode.includes('APPROVAL')) return s;
          if (mode.includes('COUPON') || mode.includes('ADVANCE') || mode.includes('CREDIT NOTE') || mode.includes('RETURN')) return s;
          return s + Number(ri.amount_paid || 0);
        }, 0);

        // 3. Parse initial billing payment_details (excludes APPROVAL, RCP and wallet modes)
        const rawPayments = typeof invoice.payment_details === 'string'
          ? JSON.parse(invoice.payment_details || '[]')
          : (invoice.payment_details || []);
        const allBillPayments: { mode: string; amount: number }[] = Array.isArray(rawPayments)
          ? rawPayments
          : Object.entries(rawPayments).filter(([k]) => k !== 'items').map(([k, v]) => ({ mode: k, amount: Number(v) }));

        const billingPaid = allBillPayments.reduce((s, p) => {
          const modeUpper = String(p.mode || '').trim().toUpperCase();
          if (modeUpper.includes('APPROVAL')) return s;
          if (modeUpper.startsWith('RCP')) return s;
          if (modeUpper.includes('COUPON') || modeUpper.includes('ADVANCE') || modeUpper.includes('CREDIT NOTE') || modeUpper.includes('RETURN')) return s;
          return s + Number(p.amount || 0);
        }, 0);

        // 4. Sum wallet applications
        const couponPaid = (invoice.coupon_applications || []).reduce((s, ca) => s + Number(ca.amount_applied || 0), 0);
        const advancePaid = (invoice.advance_applications || []).reduce((s, aa) => s + Number(aa.amount_applied || 0), 0);
        const creditNotePaid = (invoice.credit_note_applications || []).reduce((s, cna) => s + Number(cna.amount_applied || 0), 0);

        const truePaid = Math.min(billingPaid + receiptPaid + couponPaid + advancePaid + creditNotePaid, trueNet);
        const truePending = Math.max(0, trueNet - truePaid);

        let correctedStatus: 'paid' | 'partial' | 'pending';
        if (truePending < 1) correctedStatus = 'paid';
        else if (truePaid > 1) correctedStatus = 'partial';
        else correctedStatus = 'pending';

        const storedPaid = Number(invoice.amount_paid || 0);
        const storedPending = Number(invoice.amount_pending || 0);
        const storedNet = Number(invoice.net_payable || 0);

        if (Math.abs(storedPaid - truePaid) > 1 || Math.abs(storedPending - truePending) > 1 || Math.abs(storedNet - trueNet) > 1 || correctedStatus !== invoice.payment_status) {
          results.details.push(`${invoice.invoice_number}: paid ${storedPaid}→${truePaid}, pending ${storedPending}→${truePending}, net ${storedNet}→${trueNet}, status ${invoice.payment_status}→${correctedStatus}`);
          await invoiceRepo.update(invoice.id, {
            amount_paid: truePaid,
            amount_pending: truePending,
            net_payable: trueNet,
            payment_status: correctedStatus,
          });
          results.repaired++;
        }
      } catch (e: any) {
        results.errors++;
        results.details.push(`ERROR ${invoice.invoice_number}: ${e.message}`);
      }
    }

    return results;
  }
}

export const paymentService = new PaymentService();
