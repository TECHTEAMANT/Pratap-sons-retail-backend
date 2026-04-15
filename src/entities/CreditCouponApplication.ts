import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { CreditCoupon } from './CreditCoupon';
import { SalesInvoice } from './SalesInvoice';

@Entity('credit_coupon_applications')
@Unique(['coupon_id', 'invoice_id'])
export class CreditCouponApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  coupon_id: string;

  @Column({ type: 'uuid' })
  invoice_id: string;

  @Column({ type: 'numeric' })
  amount_applied: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => CreditCoupon, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coupon_id' })
  coupon: CreditCoupon;

  @ManyToOne(() => SalesInvoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;
}

