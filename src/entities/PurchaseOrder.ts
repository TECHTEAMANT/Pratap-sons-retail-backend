import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { PurchaseOrderItem } from './PurchaseOrderItem';
import { PurchaseItem } from './PurchaseItem';
import { Vendor } from './Vendor';

@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true, nullable: true })
  po_number: string;

  @Column({ type: 'text', nullable: true })
  order_number: string;

  @Column({ type: 'uuid', name: 'vendor' })
  vendor_id: string;

  @Column({ type: 'text', nullable: true })
  invoice_number: string;

  @Column({ type: 'date', nullable: true })
  vendor_invoice_date: Date;

  @Column({ type: 'int', default: 0 })
  total_items: number;

  @Column({ type: 'jsonb', nullable: true })
  gst_breakdown: any;

  @Column({ type: 'text', nullable: true })
  gst_type: string;

  @Column({ type: 'numeric', nullable: true })
  ledger_discount: number;

  @Column({ type: 'numeric', nullable: true })
  ledger_freight: number;

  @Column({ type: 'int', nullable: true })
  ledger_freight_gst_rate: number;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  order_date: Date;

  @Column({ type: 'numeric', default: 0 })
  taxable_value: number;

  @Column({ type: 'numeric', nullable: true })
  manual_gst_amount: number;

  @Column({ type: 'text', nullable: true })
  vendor_invoice_attachment: string;

  @Column({ type: 'text', nullable: true })
  gst_difference_reason: string;

  @Column({ type: 'numeric', default: 0 })
  total_amount: number;

  @Column({ type: 'text', default: 'draft' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'uuid', nullable: true })
  reference_po_id: string;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @Column({ type: 'uuid', nullable: true })
  modified_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => Vendor)
  @JoinColumn({ name: 'vendor' })
  vendor: Vendor;

  @OneToMany(() => PurchaseOrderItem, item => item.purchaseOrder, { cascade: true })
  order_items: PurchaseOrderItem[];

  @OneToMany(() => PurchaseItem, item => item.purchase_order)
  purchase_items: PurchaseItem[];
}
