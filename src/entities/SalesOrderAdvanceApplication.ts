import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { SalesOrderAdvance } from './SalesOrderAdvance';
import { SalesInvoice } from './SalesInvoice';

@Entity('sales_order_advance_applications')
@Unique(['advance_id', 'invoice_id'])
export class SalesOrderAdvanceApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  advance_id: string;

  @Column({ type: 'uuid' })
  invoice_id: string;

  @Column({ type: 'numeric' })
  amount_applied: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => SalesOrderAdvance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'advance_id' })
  advance: SalesOrderAdvance;

  @ManyToOne(() => SalesInvoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;
}

