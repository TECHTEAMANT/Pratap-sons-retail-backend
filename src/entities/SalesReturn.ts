import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { SalesReturnItem } from './SalesReturnItem';
import { SalesInvoice } from './SalesInvoice';
import { Salesman } from './Salesman';

@Entity('sales_returns')
export class SalesReturn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  return_number: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  return_date: Date;

  @Column({ type: 'uuid', nullable: true })
  invoice_id: string;

  @Column({ type: 'text', nullable: true })
  invoice_number: string;

  @Column({ type: 'text', nullable: true })
  customer_mobile: string;

  @Column({ type: 'text', nullable: true })
  customer_name: string;

  @Column({ type: 'text', nullable: true })
  return_reason: string;

  @Column({ type: 'numeric', default: 0 })
  total_return_amount: number;

  @Column({ type: 'numeric', default: 0 })
  additional_charges_returned: number;

  @Column({ type: 'numeric', default: 0 })
  additional_charges_gst_returned: number;

  @Column({ type: 'numeric', default: 0 })
  additional_charges_total_returned: number;

  @Column({ type: 'numeric', default: 0 })
  total_discount_amount: number;

  @Column({ type: 'numeric', default: 0 })
  total_loyalty_amount: number;

  @Column({ type: 'text', nullable: true })
  credit_note_number: string;

  @Column({ type: 'text', default: 'pending' })
  status: string;

  @Column({ type: 'text', nullable: true })
  credit_coupon_no: string;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @Column({ type: 'uuid', nullable: true })
  salesman_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @OneToMany(() => SalesReturnItem, item => item.salesReturn, { cascade: true })
  items: SalesReturnItem[];

  @ManyToOne(() => SalesInvoice, { nullable: true })
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;

  @ManyToOne(() => Salesman, { nullable: true })
  @JoinColumn({ name: 'salesman_id' })
  salesman: Salesman;
}
