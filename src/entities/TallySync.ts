import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SalesInvoice } from './SalesInvoice';

@Entity('tally_sync')
export class TallySync {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  invoice_id: string;

  @Column({ type: 'text' })
  invoice_number: string;

  @Column({ type: 'date' })
  invoice_date: Date;

  @Column({ type: 'text', nullable: true })
  customer_name: string;

  @Column({ type: 'text', nullable: true })
  customer_mobile: string;

  @Column({ type: 'numeric', default: 0 })
  total_amount: number;

  @Column({ type: 'jsonb', default: {} })
  sync_data: Record<string, any>;

  @Column({ type: 'text', default: 'pending' })
  sync_status: string;

  @Column({ type: 'uuid', nullable: true })
  receipt_id: string;

  @Column({ type: 'text', nullable: true })
  receipt_number: string;

  @Column({ type: 'uuid', nullable: true })
  purchase_return_id: string;

  @Column({ type: 'uuid', nullable: true })
  sales_return_id: string;

  @Column({ type: 'timestamptz', nullable: true })
  synced_at: Date;

  @Column({ type: 'text', nullable: true })
  error_message: string;

  @Column({ type: 'uuid', nullable: true })
  po_id: string;

  @Column({ type: 'text', nullable: true })
  po_number: string;

  @Column({ type: 'text', nullable: true })
  vendor_name: string;

  @Column({ type: 'text', nullable: true })
  record_type: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => SalesInvoice, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;

  @ManyToOne('PaymentReceipt', { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receipt_id' })
  receipt: any;

  @ManyToOne('PurchaseReturn', { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_return_id' })
  purchase_return: any;

  @ManyToOne('SalesReturn', { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sales_return_id' })
  sales_return: any;
}
