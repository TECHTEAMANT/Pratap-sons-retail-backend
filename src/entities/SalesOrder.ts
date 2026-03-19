import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { SalesOrderItem } from './SalesOrderItem';
import { SalesOrderAdvance } from './SalesOrderAdvance';
import { Customer } from './Customer';

@Entity('sales_orders')
export class SalesOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  order_number: string;

  @Column({ type: 'uuid', nullable: true })
  customer_id: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  order_date: Date;

  @Column({ type: 'date', nullable: true })
  expected_delivery_date: Date;

  @Column({ type: 'text', default: 'pending' })
  status: string;

  @Column({ type: 'numeric', default: 0 })
  total_amount: number;

  @Column({ type: 'numeric', default: 0 })
  advance_received: number;

  @Column({ type: 'numeric', default: 0 })
  balance_amount: number;

  @Column({ type: 'text', nullable: true })
  attachment_url: string;

  @Column({ type: 'text', default: '' })
  notes: string;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @Column({ type: 'uuid', nullable: true })
  salesman_id: string;

  @OneToMany(() => SalesOrderItem, item => item.salesOrder, { cascade: true })
  items: SalesOrderItem[];

  @OneToMany(() => SalesOrderAdvance, adv => adv.salesOrder, { cascade: true })
  advances: SalesOrderAdvance[];

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @ManyToOne('Salesman', { nullable: true })
  @JoinColumn({ name: 'salesman_id' })
  salesman: any;
}
