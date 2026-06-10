import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CreditCoupon } from './CreditCoupon';

@Entity('credit_coupon_refunds')
export class CreditCouponRefund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  coupon_id: string;

  @Column({ type: 'numeric' })
  amount: number;

  @Column({ type: 'text' })
  payment_mode: string; // e.g., 'Cash', 'UPI', 'Bank Transfer'

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => CreditCoupon, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coupon_id' })
  coupon: CreditCoupon;
}
