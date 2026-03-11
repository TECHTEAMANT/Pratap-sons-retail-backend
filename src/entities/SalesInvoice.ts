import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { SalesInvoiceItem } from './SalesInvoiceItem';
import { Customer } from './Customer';

@Entity('sales_invoices')
export class SalesInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  invoice_number: string;

  @Column({ type: 'date' })
  invoice_date: Date;

  @Column({ type: 'text', nullable: true })
  customer_mobile: string;

  @Column({ type: 'text', nullable: true })
  customer_name: string;

  @Column({ type: 'uuid', nullable: true })
  customer_id: string;

  @Column({ type: 'numeric', default: 0 })
  total_mrp: number;

  @Column({ type: 'numeric', default: 0 })
  total_discount: number;

  @Column({ type: 'numeric', default: 0 })
  taxable_value: number;

  @Column({ type: 'numeric', default: 0 })
  total_gst: number;

  @Column({ type: 'text', default: 'CGST_SGST' })
  gst_type: string;

  @Column({ type: 'numeric', default: 0 })
  cgst_5: number;

  @Column({ type: 'numeric', default: 0 })
  sgst_5: number;

  @Column({ type: 'numeric', default: 0 })
  cgst_18: number;

  @Column({ type: 'numeric', default: 0 })
  sgst_18: number;

  @Column({ type: 'numeric', default: 0 })
  igst_5: number;

  @Column({ type: 'numeric', default: 0 })
  igst_18: number;

  @Column({ type: 'numeric', default: 0 })
  net_payable: number;

  @Column({ type: 'uuid', nullable: true })
  voucher_id: string;

  @Column({ type: 'numeric', default: 0 })
  voucher_discount: number;

  @Column({ type: 'text', nullable: true })
  payment_mode: string;

  @Column({ type: 'numeric', default: 0 })
  amount_paid: number;

  @Column({ type: 'numeric', default: 0 })
  amount_pending: number;

  @Column({ type: 'text', default: 'pending' })
  payment_status: string;

  @Column({ type: 'uuid', nullable: true })
  sales_order_id: string;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @Column({ type: 'uuid', nullable: true })
  modified_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @OneToMany(() => SalesInvoiceItem, item => item.invoice, { cascade: true })
  items: SalesInvoiceItem[];

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;
}
