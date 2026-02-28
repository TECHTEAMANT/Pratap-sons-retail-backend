import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('e_bookings')
export class EBooking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true, nullable: true })
  booking_number: string;

  @Column({ type: 'text' })
  customer_mobile: string;

  @Column({ type: 'text' })
  barcode_8digit: string;

  @Column({ type: 'text', nullable: true })
  floor: string;

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
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
