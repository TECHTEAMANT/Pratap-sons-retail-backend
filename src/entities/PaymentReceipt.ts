import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { SalesInvoice } from './SalesInvoice';
import { PaymentReceiptItem } from './PaymentReceiptItem';

@Entity('payment_receipts')
export class PaymentReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  receipt_number: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  receipt_date: Date;

  @Column({ type: 'uuid', nullable: true })
  invoice_id: string;

  @Column({ type: 'text', nullable: true })
  invoice_number: string;

  @Column({ type: 'text', nullable: true })
  customer_mobile: string;

  @Column({ type: 'text', nullable: true })
  customer_name: string;

  @Column({ type: 'numeric' })
  amount_received: number;

  @Column({ type: 'text' })
  payment_mode: string;

  @Column({ type: 'text', nullable: true })
  reference_number: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'jsonb', nullable: true })
  payment_details: any;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // Relations
  @ManyToOne(() => SalesInvoice)
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;

  @OneToMany(() => PaymentReceiptItem, (item) => item.receipt)
  items: PaymentReceiptItem[];
}
