import { AppDataSource } from '../config/data-source';
import { PaymentReceipt } from '../entities/PaymentReceipt';
import { SalesInvoice } from '../entities/SalesInvoice';

export class PaymentService {
  private repo = AppDataSource.getRepository(PaymentReceipt);

  async findAll(filters: { invoice_id?: string; customer_mobile?: string }) {
    const where: any = {};
    if (filters.invoice_id) where.invoice_id = filters.invoice_id;
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
      // payment_receipts insert will be handled by TypeORM or manual save
      // Triggers handle the invoice updates once payment_receipt_items are inserted
      const receipt = manager.create(PaymentReceipt, {
        ...data,
        created_by: userId,
      });
      return await manager.save(receipt);
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
