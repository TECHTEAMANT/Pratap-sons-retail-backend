import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SalesOrderAdvance } from './SalesOrderAdvance';

@Entity('sales_order_advance_refunds')
export class SalesOrderAdvanceRefund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  advance_id: string;

  @Column({ type: 'numeric' })
  amount: number;

  @Column({ type: 'text' })
  payment_mode: string; // e.g., 'Cash', 'UPI', 'Bank Transfer'

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => SalesOrderAdvance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'advance_id' })
  advance: SalesOrderAdvance;
}
