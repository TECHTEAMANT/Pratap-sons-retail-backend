import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SalesOrder } from './SalesOrder';

@Entity('sales_order_advances')
export class SalesOrderAdvance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sales_order_id: string;

  @Column({ type: 'numeric' })
  amount: number;

  @Column({ type: 'text', nullable: true })
  payment_mode?: string;

  @Column({ type: 'text', nullable: true })
  reference_number?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'text', unique: true, nullable: true })
  receipt_number: string;

  @Column({ type: 'text', default: 'active' }) // active, redeemed
  status: string;

  @Column({ type: 'uuid', nullable: true })
  redeemed_invoice_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // Relations
  @ManyToOne(() => SalesOrder, order => order.advances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder: SalesOrder;
}
