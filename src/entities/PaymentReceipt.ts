import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SalesInvoice } from './SalesInvoice';

@Entity('payment_receipts')
export class PaymentReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  receipt_number: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  receipt_date: Date;

  @Column({ type: 'uuid' })
  invoice_id: string;

  @Column({ type: 'text' })
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

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // Relations
  @ManyToOne(() => SalesInvoice)
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;
}
