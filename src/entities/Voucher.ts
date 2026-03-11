import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DiscountMaster } from './DiscountMaster';
import { SalesInvoice } from './SalesInvoice';

@Entity('vouchers')
export class Voucher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  voucher_code: string;

  @ManyToOne(() => DiscountMaster)
  @JoinColumn({ name: 'discount_master_id' })
  discount_master: DiscountMaster;

  @Column({ type: 'uuid' })
  discount_master_id: string;

  @Column({ type: 'boolean', default: false })
  is_redeemed: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  redeemed_at: Date;

  @ManyToOne(() => SalesInvoice, { nullable: true })
  @JoinColumn({ name: 'redeemed_in_invoice_id' })
  redeemed_in_invoice: SalesInvoice;

  @Column({ type: 'uuid', nullable: true })
  redeemed_in_invoice_id: string;

  @Column({ type: 'date', nullable: true })
  expiry_date: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
