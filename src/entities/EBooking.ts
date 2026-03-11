import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { EBookingItem } from './EBookingItem';
import { Floor } from './Floor';
import { User } from './User';

@Entity('e_bookings')
export class EBooking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true, nullable: true })
  booking_number: string;

  @Column({ type: 'text', name: 'customer_mobile' })
  customer_identity: string;

  @Column({ type: 'text', nullable: true })
  barcode_8digit: string;

  @Column({ type: 'text', nullable: true })
  floor: string;

  @ManyToOne(() => Floor, { nullable: true })
  @JoinColumn({ name: 'floor' })
  floor_details: Floor;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  booking_date: Date;

  @Column({ type: 'timestamptz', nullable: true })
  booking_expiry: Date;

  @Column({ type: 'text', default: 'booked' })
  status: string;

  @Column({ type: 'text', nullable: true })
  invoice_number: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'uuid', nullable: true })
  salesman_id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount_amount: number;

  @Column({ type: 'text', default: 'amount' })
  discount_type: string;

  @Column({ type: 'uuid', nullable: true })
  discount_given_by: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'discount_given_by' })
  discount_given_by_details: User;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  created_by_details: User;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => EBookingItem, item => item.booking, { cascade: true })
  items: EBookingItem[];
}
