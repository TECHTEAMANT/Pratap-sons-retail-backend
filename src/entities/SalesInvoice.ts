import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { SalesInvoiceItem } from './SalesInvoiceItem';
import { Customer } from './Customer';
import { Salesman } from './Salesman';
import { User } from './User';
import { Floor } from './Floor';
import { PaymentReceiptItem } from './PaymentReceiptItem';

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
  voucher_id: string | null;

  @Column({ type: 'numeric', default: 0 })
  voucher_discount: number;

  @Column({ type: 'text', nullable: true })
  voucher_code: string | null;

  @Column({ type: 'text', nullable: true })
  coupon_no: string | null;

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

  @Column({ type: 'numeric', default: 0 })
  loyalty_points_earned: number;

  @Column({ type: 'numeric', default: 0 })
  loyalty_points_redeemed: number;

  @Column({ type: 'numeric', default: 0 })
  loyalty_redemption_amount: number;

  @Column({ type: 'numeric', default: 0 })
  additional_charges_base: number;

  @Column({ type: 'numeric', default: 0 })
  additional_charges_gst_rate: number;

  @Column({ type: 'numeric', default: 0 })
  additional_charges_gst: number;

  @Column({ type: 'numeric', default: 0 })
  additional_charges_total: number;

  @Column({ type: 'numeric', default: 0 })
  coupon_amount: number;

  @Column({ type: 'numeric', default: 0 })
  special_discount: number;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @Column({ type: 'uuid', nullable: true })
  modified_by: string;

  @Column({ type: 'text', nullable: true })
  pan_no: string;

  @Column({ type: 'text', nullable: true })
  aadhar_no: string;

  @Column({ type: 'text', nullable: true })
  customer_gstin: string;

  @Column({ type: 'jsonb', nullable: true })
  payment_details: any;

  @Column({ type: 'uuid', nullable: true })
  salesman_id: string;

  @Column({ type: 'uuid', nullable: true })
  floor_id: string;

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

  @ManyToOne(() => Salesman, { nullable: true })
  @JoinColumn({ name: 'salesman_id' })
  salesman: Salesman;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'modified_by' })
  modifier: User;

  @ManyToOne(() => Floor, { nullable: true })
  @JoinColumn({ name: 'floor_id' })
  floor_details: Floor;

  @OneToMany(() => PaymentReceiptItem, item => item.invoice)
  receipt_items: PaymentReceiptItem[];
}
