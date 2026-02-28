import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('purchase_order_sequence')
export class PurchaseOrderSequence {
  @PrimaryColumn({ type: 'integer', default: 1 })
  id!: number;

  @Column({ type: 'integer', default: 0 })
  last_number!: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
