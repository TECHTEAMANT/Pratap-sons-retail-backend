import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Vendor } from './Vendor';
import { PurchaseReturnItem } from './PurchaseReturnItem';

@Entity('purchase_returns')
export class PurchaseReturn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  return_number: string;

  @Column({ type: 'uuid' })
  vendor_id: string;

  @Column({ type: 'uuid', nullable: true })
  original_po_id: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  return_date: Date;

  @Column({ type: 'int', default: 0 })
  total_items: number;

  @Column({ type: 'numeric', default: 0 })
  total_amount: number;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text', default: 'draft' })
  status: string;

  @Column({ type: 'text', nullable: true })
  gst_type: string;

  @Column({ type: 'numeric', nullable: true })
  cgst_amount: number;

  @Column({ type: 'numeric', nullable: true })
  sgst_amount: number;

  @Column({ type: 'numeric', nullable: true })
  igst_amount: number;

  @Column({ type: 'numeric', nullable: true })
  total_return_amount: number;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => Vendor)
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor;

  @OneToMany(() => PurchaseReturnItem, item => item.purchase_return)
  items: PurchaseReturnItem[];
}
