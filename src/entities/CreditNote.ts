import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SalesReturn } from './SalesReturn';
import { SalesInvoice } from './SalesInvoice';

@Entity('credit_notes')
export class CreditNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  credit_note_number: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  credit_date: Date;

  @Column({ type: 'text', nullable: true })
  customer_mobile: string;

  @Column({ type: 'text', nullable: true })
  customer_name: string;

  @Column({ type: 'uuid', nullable: true })
  return_id: string;

  @Column({ type: 'uuid', nullable: true })
  invoice_id: string;

  @Column({ type: 'numeric', default: 0 })
  credit_amount: number;

  @Column({ type: 'numeric', default: 0 })
  balance_used: number;

  @Column({ type: 'numeric', default: 0 })
  balance_remaining: number;

  @Column({ type: 'text', default: 'active' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => SalesReturn, { nullable: true })
  @JoinColumn({ name: 'return_id' })
  salesReturn: SalesReturn;

  @ManyToOne(() => SalesInvoice, { nullable: true })
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;
}
