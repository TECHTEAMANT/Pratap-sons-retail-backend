import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SalesReturn } from './SalesReturn';

@Entity('sales_return_items')
export class SalesReturnItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  return_id: string;

  @Column({ type: 'text', nullable: true })
  barcode_8digit: string;

  @Column({ type: 'text', nullable: true })
  design_no: string;

  @Column({ type: 'text', nullable: true })
  hsn_code: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'numeric', default: 0 })
  mrp: number;

  @Column({ type: 'numeric', default: 0 })
  taxable_value: number;

  @Column({ type: 'numeric', default: 0 })
  gst_amount: number;

  @Column({ type: 'numeric', default: 0 })
  return_amount: number;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // Relations
  @ManyToOne(() => SalesReturn, ret => ret.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_id' })
  salesReturn: SalesReturn;
}
