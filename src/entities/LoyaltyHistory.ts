import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Customer } from './Customer';

export enum LoyaltyTransactionType {
  EARN = 'EARN',
  REDEEM = 'REDEEM',
  BIRTHDAY = 'BIRTHDAY',
  ANNIVERSARY = 'ANNIVERSARY',
  ADJUSTMENT = 'ADJUSTMENT'
}

@Entity('loyalty_history')
export class LoyaltyHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  customer_id: string;

  @Column({ type: 'numeric' })
  points: number;

  @Column({
    type: 'enum',
    enum: LoyaltyTransactionType,
    default: LoyaltyTransactionType.EARN
  })
  type: LoyaltyTransactionType;

  @Column({ type: 'text', nullable: true })
  reference_id: string; // e.g., SalesInvoice matching the EARN/REDEEM

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'timestamptz', nullable: true })
  expires_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;
}
