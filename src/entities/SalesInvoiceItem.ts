import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SalesInvoice } from './SalesInvoice';
import { Salesman } from './Salesman';
import { BarcodeBatch } from './BarcodeBatch';

@Entity('sales_invoice_items')
export class SalesInvoiceItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  invoice_id: string;

  @Column({ type: 'int', nullable: true })
  sr_no: number;

  @Column({ type: 'text', nullable: true })
  barcode_8digit: string;

  @Column({ type: 'text', nullable: true })
  design_no: string;

  @Column({ type: 'text', nullable: true })
  product_description: string;

  @Column({ type: 'text', nullable: true })
  hsn_code: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'numeric', default: 0 })
  mrp: number;

  @Column({ type: 'numeric', default: 0 })
  discount: number;

  @Column({ type: 'numeric', default: 0 })
  taxable_value: number;

  @Column({ type: 'numeric', default: 0 })
  gst_percentage: number;

  @Column({ type: 'text', default: 'CGST_SGST' })
  gst_type: string;

  @Column({ type: 'numeric', default: 0 })
  cgst_percentage: number;

  @Column({ type: 'numeric', default: 0 })
  cgst_amount: number;

  @Column({ type: 'numeric', default: 0 })
  sgst_percentage: number;

  @Column({ type: 'numeric', default: 0 })
  sgst_amount: number;

  @Column({ type: 'numeric', default: 0 })
  igst_percentage: number;

  @Column({ type: 'numeric', default: 0 })
  igst_amount: number;

  @Column({ type: 'numeric', default: 0 })
  total_value: number;

  @Column({ type: 'numeric', default: 0 })
  selling_price: number;

  @Column({ type: 'uuid', nullable: true })
  salesman_id: string;

  @Column({ type: 'boolean', default: false })
  delivered: boolean;

  @Column({ type: 'date', nullable: true })
  delivery_date: Date;

  @Column({ type: 'date', nullable: true })
  expected_delivery_date: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // Relations
  @ManyToOne(() => SalesInvoice, invoice => invoice.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;

  @ManyToOne(() => Salesman, { nullable: true })
  @JoinColumn({ name: 'salesman_id' })
  salesman: Salesman;

  @ManyToOne(() => BarcodeBatch, { nullable: true })
  @JoinColumn({ name: 'barcode_8digit', referencedColumnName: 'barcode_alias_8digit' })
  product_item: BarcodeBatch;
}
