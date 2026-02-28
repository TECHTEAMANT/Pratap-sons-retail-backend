import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('barcode_sequence')
export class BarcodeSequence {
  @PrimaryColumn({ type: 'int', default: 1 })
  id: number;

  @Column({ type: 'bigint', default: 10000000 })
  last_number: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
