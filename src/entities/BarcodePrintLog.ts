import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BarcodeBatch } from './BarcodeBatch';

@Entity('barcode_print_logs')
export class BarcodePrintLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  barcode_alias: string;

  @Column({ type: 'uuid', nullable: true })
  barcode_batch_id: string;

  @Column({ type: 'int', default: 1 })
  quantity_printed: number;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'uuid', nullable: true })
  printed_by: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  printed_at: Date;

  // Relations
  @ManyToOne(() => BarcodeBatch, batch => batch.printLogs)
  @JoinColumn({ name: 'barcode_batch_id' })
  barcodeBatch: BarcodeBatch;
}
