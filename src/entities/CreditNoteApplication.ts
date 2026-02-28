import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CreditNote } from './CreditNote';
import { SalesInvoice } from './SalesInvoice';

@Entity('credit_note_applications')
export class CreditNoteApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  credit_note_id: string;

  @Column({ type: 'uuid' })
  invoice_id: string;

  @Column({ type: 'numeric' })
  amount_applied: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // Relations
  @ManyToOne(() => CreditNote)
  @JoinColumn({ name: 'credit_note_id' })
  creditNote: CreditNote;

  @ManyToOne(() => SalesInvoice)
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;
}
