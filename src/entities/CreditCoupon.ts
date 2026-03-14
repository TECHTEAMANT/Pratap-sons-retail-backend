import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Customer } from './Customer';
import { SalesInvoice } from './SalesInvoice';
import { SalesReturn } from './SalesReturn';

@Entity('credit_coupons')
export class CreditCoupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  coupon_no: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'text' })
  customer_mobile: string;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_mobile', referencedColumnName: 'mobile' })
  customer: Customer;

  @Column({ type: 'text', default: 'active' }) // active, redeemed, expired
  status: string;

  @Column({ type: 'uuid', nullable: true })
  original_sales_return_id: string;

  @ManyToOne(() => SalesReturn, { nullable: true })
  @JoinColumn({ name: 'original_sales_return_id' })
  original_return: SalesReturn;

  @Column({ type: 'uuid', nullable: true })
  redeemed_invoice_id: string;

  @ManyToOne(() => SalesInvoice, { nullable: true })
  @JoinColumn({ name: 'redeemed_invoice_id' })
  redeemed_invoice: SalesInvoice;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
