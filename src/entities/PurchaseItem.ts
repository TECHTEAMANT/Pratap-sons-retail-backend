import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { PurchaseOrder } from './PurchaseOrder';
import { ProductGroup } from './ProductGroup';
import { Color } from './Color';
import { Size } from './Size';

@Entity('purchase_items')
export class PurchaseItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  po_id!: string;

  @ManyToOne(() => PurchaseOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'po_id' })
  purchase_order!: PurchaseOrder;

  @Column({ type: 'text' })
  design_no!: string;

  @Column({ name: 'product_group', type: 'uuid' })
  product_group_id!: string;

  @ManyToOne(() => ProductGroup)
  @JoinColumn({ name: 'product_group' })
  product_group!: ProductGroup;

  @Column({ name: 'color', type: 'uuid', nullable: true })
  color_id!: string | null;

  @ManyToOne(() => Color, { nullable: true })
  @JoinColumn({ name: 'color' })
  color!: Color | null;

  @Column({ name: 'size', type: 'uuid' })
  size_id!: string;

  @ManyToOne(() => Size)
  @JoinColumn({ name: 'size' })
  size!: Size;

  @Column({ type: 'integer', default: 0 })
  quantity!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cost_per_item!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  mrp!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  mrp_markup_percent!: number;

  @Column({ type: 'text', default: 'AUTO_5_18' })
  gst_logic!: string;

  @Column({ type: 'text', nullable: true })
  description!: string;

  @Column({ type: 'text', nullable: true })
  order_number!: string;

  @Column({ type: 'text', nullable: true })
  hsn_code!: string;

  @Column({ type: 'uuid', nullable: true })
  floor_id!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
