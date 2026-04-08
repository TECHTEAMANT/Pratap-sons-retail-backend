import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SalesOrder } from './SalesOrder';
import { Salesman } from './Salesman';

@Entity('sales_order_items')
export class SalesOrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sales_order_id: string;

  @Column({ type: 'int', nullable: true })
  sr_no: number;

  @Column({ type: 'text', nullable: true })
  barcode_8digit: string;

  @Column({ type: 'text', nullable: true })
  design_no: string;

  @Column({ type: 'text', nullable: true })
  hsn_code: string;

  @Column({ type: 'text', default: '' })
  product_description: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'numeric', default: 0 })
  mrp: number;

  @Column({ type: 'uuid', nullable: true })
  salesman_id: string;

  @Column({ type: 'numeric', default: 0 })
  discount_percentage: number;

  @Column({ type: 'numeric', default: 5 })
  gst_percentage: number;

  @Column({ type: 'int', default: 0 })
  delivered_quantity: number;

  @Column({ type: 'numeric', default: 0 })
  total: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => SalesOrder, order => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder: SalesOrder;

  @ManyToOne(() => Salesman, { nullable: true })
  @JoinColumn({ name: 'salesman_id' })
  salesman: Salesman;
}
