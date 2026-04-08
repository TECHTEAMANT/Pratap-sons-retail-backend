import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { PaymentReceipt } from './PaymentReceipt';
import { SalesInvoice } from './SalesInvoice';

@Entity('payment_receipt_items')
export class PaymentReceiptItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  receipt_id: string;

  @Column({ type: 'uuid' })
  invoice_id: string;

  @Column({ type: 'numeric' })
  amount_paid: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // Relations
  @ManyToOne(() => PaymentReceipt, (receipt) => receipt.items)
  @JoinColumn({ name: 'receipt_id' })
  receipt: PaymentReceipt;

  @ManyToOne(() => SalesInvoice, (invoice) => invoice.receipt_items)
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;
}
