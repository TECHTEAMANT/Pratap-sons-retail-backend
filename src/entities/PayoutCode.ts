import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('payout_codes')
export class PayoutCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  payout_code: string;

  @Column({ type: 'text' })
  payout_name: string;

  @Column({ type: 'text', default: 'standard' })
  payout_type: string;

  @Column({ type: 'text', array: true, default: '{}' })
  applicable_product_groups: string[];

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
