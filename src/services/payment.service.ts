import { AppDataSource } from '../config/data-source';
import { PaymentReceipt } from '../entities/PaymentReceipt';
import { SalesInvoice } from '../entities/SalesInvoice';

export class PaymentService {
  private repo = AppDataSource.getRepository(PaymentReceipt);

  async findAll(filters: { invoice_id?: string; customer_mobile?: string }) {
    const where: any = {};
    if (filters.invoice_id) where.invoice_id = filters.invoice_id;
    if (filters.customer_mobile) where.customer_mobile = filters.customer_mobile;
    return this.repo.find({ where, order: { created_at: 'DESC' } });
  }

  async create(data: any, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      const count = await manager.count(PaymentReceipt);
      const recNum = `REC${new Date().getFullYear()}${(count + 1).toString().padStart(6, '0')}`;

      const receipt = manager.create(PaymentReceipt, {
        receipt_number: recNum,
        receipt_date: data.receipt_date || new Date(),
        invoice_id: data.invoice_id,
        invoice_number: data.invoice_number,
        customer_mobile: data.customer_mobile || null,
        customer_name: data.customer_name || null,
        amount_received: data.amount_received,
        payment_mode: data.payment_mode,
        reference_number: data.reference_number || null,
        notes: data.notes || null,
        created_by: userId,
      });
      const saved = await manager.save(receipt);

      // Update invoice payment status
      const invoice = await manager.findOne(SalesInvoice, { where: { id: data.invoice_id } });
      if (invoice) {
        invoice.amount_paid = Number(invoice.amount_paid) + Number(data.amount_received);
        invoice.amount_pending = Number(invoice.net_payable) - Number(invoice.amount_paid);
        invoice.payment_status = invoice.amount_pending <= 0 ? 'paid' : invoice.amount_paid > 0 ? 'partial' : 'pending';
        await manager.save(invoice);
      }

      return saved;
    });
  }

  async delete(id: string) {
    return AppDataSource.transaction(async (manager) => {
      const receipt = await manager.findOne(PaymentReceipt, { where: { id } });
      if (!receipt) return null;

      // Reverse the payment on invoice
      const invoice = await manager.findOne(SalesInvoice, { where: { id: receipt.invoice_id } });
      if (invoice) {
        invoice.amount_paid = Number(invoice.amount_paid) - Number(receipt.amount_received);
        invoice.amount_pending = Number(invoice.net_payable) - Number(invoice.amount_paid);
        invoice.payment_status = invoice.amount_paid <= 0 ? 'pending' : 'partial';
        await manager.save(invoice);
      }

      await manager.remove(receipt);
      return receipt;
    });
  }
}

export const paymentService = new PaymentService();
