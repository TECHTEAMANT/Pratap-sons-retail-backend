import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { PayoutCode } from './PayoutCode';

@Entity('commission_slabs')
export class CommissionSlab {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: true })
  product_group_name: string;

  @Column({ type: 'uuid', nullable: true })
  payout_code_id: string;

  @Column({ type: 'numeric', default: 0 })
  min_amount: number;

  @Column({ type: 'numeric', nullable: true })
  max_amount: number;

  @Column({ type: 'numeric', default: 0 })
  commission_percentage: number;

  @Column({ type: 'numeric', default: 0 })
  flat_amount: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => PayoutCode, { nullable: true })
  @JoinColumn({ name: 'payout_code_id' })
  payoutCode: PayoutCode;
}
