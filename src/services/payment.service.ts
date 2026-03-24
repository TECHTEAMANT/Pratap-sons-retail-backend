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
          // Create receipt item
          const item = manager.create(PaymentReceiptItem, {
            receipt_id: savedReceipt.id,
            invoice_id: itemData.invoice_id,
            amount_paid: itemData.amount_paid,
          });
          await manager.save(item);

          // Update invoice balance
          const invoice = await manager.findOne(SalesInvoice, { where: { id: itemData.invoice_id } });
          if (invoice) {
            invoice.amount_paid = Number(invoice.amount_paid || 0) + Number(itemData.amount_paid);
            invoice.amount_pending = Math.max(0, Number(invoice.net_payable) - Number(invoice.amount_paid));
            
            if (invoice.amount_pending <= 0) {
              invoice.payment_status = 'paid';
            } else if (invoice.amount_paid > 0) {
              invoice.payment_status = 'partial';
            } else {
              invoice.payment_status = 'pending';
            }
            await manager.save(invoice);
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

            if (invoice.amount_pending <= 0) {
              invoice.payment_status = 'paid';
            } else if (invoice.amount_paid > 0) {
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
}

export const paymentService = new PaymentService();
