import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  mobile: string;

  @Column({ type: 'text', unique: true, nullable: true })
  card_no: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ type: 'text', nullable: true })
  city: string;

  @Column({ type: 'text', nullable: true })
  pincode: string;

  @Column({ type: 'text', nullable: true })
  gstin: string;

  @Column({ type: 'date', nullable: true })
  birthday: Date;

  @Column({ type: 'date', nullable: true })
  anniversary: Date;

  @Column({ type: 'text', default: 'active' })
  status: string;

  @Column({ type: 'date', nullable: true })
  last_purchase_date: Date;

  @Column({ type: 'date', nullable: true })
  first_purchase_date: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'numeric', default: 0 })
  loyalty_points: number;

  @Column({ type: 'numeric', default: 0 })
  loyalty_points_balance: number;

  @Column({ type: 'numeric', default: 0 })
  total_purchases: number;

  @Column({ type: 'int', default: 0 })
  total_visits: number;

  @Column({ type: 'numeric', default: 0 })
  credit_balance: number;

  @Column({ type: 'numeric', default: 0 })
  total_returns: number;

  @Column({ type: 'int', default: 0 })
  return_count: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
