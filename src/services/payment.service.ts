import { Between, MoreThanOrEqual, LessThanOrEqual, In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { PaymentReceipt } from '../entities/PaymentReceipt';
import { PaymentReceiptItem } from '../entities/PaymentReceiptItem';
import { SalesInvoice } from '../entities/SalesInvoice';

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

    // Get all invoices with their receipt items
    const invoices = await invoiceRepo
      .createQueryBuilder('si')
      .leftJoinAndSelect('si.receipt_items', 'ri')
      .getMany();

    for (const invoice of invoices) {
      try {
        // 1. Sum actual PaymentReceipt items
        const receiptPaid = (invoice.receipt_items || []).reduce((s, ri) => s + Number(ri.amount_paid || 0), 0);

        // 2. Parse initial billing payment_details (excludes RCP mode entries to avoid double-count)
        const rawPayments = typeof invoice.payment_details === 'string'
          ? JSON.parse(invoice.payment_details || '[]')
          : (invoice.payment_details || []);
        const billPayments: { mode: string; amount: number }[] = Array.isArray(rawPayments)
          ? rawPayments
          : Object.entries(rawPayments).filter(([k]) => k !== 'items').map(([k, v]) => ({ mode: k, amount: Number(v) }));

        const billingPaid = billPayments.reduce((s, p) => {
          const modeUpper = String(p.mode || '').trim().toUpperCase();
          // Skip RCP entries from payment_details - they're handled by receipt_items
          if (modeUpper.startsWith('RCP')) return s;
          return s + Number(p.amount || 0);
        }, 0);

        // Billing Rule: Higher of Item Discounts OR Voucher Discount
        const effectiveBaseDiscount = Math.max(Number(invoice.total_discount || 0), Number(invoice.voucher_discount || 0));
        const trueNet = Math.max(0, 
          Number(invoice.total_mrp || 0) 
          - effectiveBaseDiscount 
          - Number(invoice.special_discount || 0) 
          - Number(invoice.loyalty_redemption_amount || 0)
          - Number(invoice.coupon_amount || 0)
          + Number(invoice.additional_charges_total || 0)
        );

        const truePaid = Math.min(billingPaid + receiptPaid, trueNet);
        const truePending = Math.max(0, trueNet - truePaid);

        let correctedStatus: 'paid' | 'partial' | 'pending';
        if (truePending < 0.05) correctedStatus = 'paid';
        else if (truePaid > 0.05) correctedStatus = 'partial';
        else correctedStatus = 'pending';

        const storedPaid = Number(invoice.amount_paid || 0);
        const storedPending = Number(invoice.amount_pending || 0);
        const storedNet = Number(invoice.net_payable || 0);

        if (Math.abs(storedPaid - truePaid) > 0.5 || Math.abs(storedPending - truePending) > 0.5 || Math.abs(storedNet - trueNet) > 0.5 || correctedStatus !== invoice.payment_status) {
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
