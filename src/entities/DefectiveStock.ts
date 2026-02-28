import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BarcodeBatch } from './BarcodeBatch';

@Entity('defective_stock')
export class DefectiveStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  barcode_batch_id: string;

  @Column({ type: 'text', nullable: true })
  barcode_alias: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text', default: 'reported' })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  reported_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => BarcodeBatch, { nullable: true })
  @JoinColumn({ name: 'barcode_batch_id' })
  barcodeBatch: BarcodeBatch;
}
