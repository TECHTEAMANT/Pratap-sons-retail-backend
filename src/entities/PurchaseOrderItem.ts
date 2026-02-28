import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { PurchaseOrder } from './PurchaseOrder';

@Entity('purchase_order_items')
export class PurchaseOrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  purchase_order_id: string;

  @Column({ type: 'text', nullable: true })
  design_no: string;

  @Column({ type: 'text', nullable: true })
  product_group: string;

  @Column({ type: 'text', nullable: true })
  size: string;

  @Column({ type: 'text', nullable: true })
  color: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'numeric', default: 0 })
  rate: number;

  @Column({ type: 'numeric', default: 0 })
  total: number;

  @Column({ type: 'text', nullable: true })
  product_description: string;

  @Column({ type: 'numeric', default: 0 })
  cost: number;

  @Column({ type: 'numeric', default: 0 })
  mrp: number;

  @Column({ type: 'text', nullable: true })
  hsn_code: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // Relations
  @ManyToOne(() => PurchaseOrder, po => po.order_items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder: PurchaseOrder;
}
