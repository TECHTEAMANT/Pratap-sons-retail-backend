import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { SalesReturn } from './SalesReturn';
import { Salesman } from './Salesman';

import { BarcodeBatch } from './BarcodeBatch';

@Entity('sales_return_items')
export class SalesReturnItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;


  @Index()
  @Column({ type: 'text', nullable: true })
  barcode_8digit: string;

  @Index()
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

  @Column({ type: 'numeric', default: 0 })
  discount_amount: number;

  @Column({ type: 'numeric', default: 0 })
  loyalty_amount: number;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'uuid', nullable: true })
  salesman_id: string;

  @Column({ type: 'boolean', default: false })
  on_approval: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @Column({ type: 'uuid', nullable: true })
  return_id: string;

  // Relations
  @Index()
  @ManyToOne(() => SalesReturn, ret => ret.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_id' })
  salesReturn: SalesReturn;

  @ManyToOne(() => Salesman, { nullable: true })
  @JoinColumn({ name: 'salesman_id' })
  salesman: Salesman;

  @ManyToOne(() => BarcodeBatch, { nullable: true })
  @JoinColumn({ name: 'barcode_8digit', referencedColumnName: 'barcode_alias_8digit' })
  product_item: BarcodeBatch;
}
