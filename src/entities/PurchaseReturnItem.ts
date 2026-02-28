import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { PurchaseReturn } from './PurchaseReturn';

@Entity('purchase_return_items')
export class PurchaseReturnItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  return_id!: string;

  @ManyToOne(() => PurchaseReturn, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_id' })
  purchase_return!: PurchaseReturn;

  @Column({ type: 'uuid' })
  item_id!: string;

  @Column({ type: 'text' })
  barcode_id!: string;

  @Column({ type: 'text', nullable: true })
  reason!: string;

  @Column({ type: 'text', default: 'defective' })
  condition!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cost!: number;

  @Column({ type: 'text', nullable: true })
  hsn_code!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
