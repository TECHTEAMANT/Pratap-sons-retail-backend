import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { EBooking } from './EBooking';
import { Salesman } from './Salesman';

@Entity('e_booking_items')
export class EBookingItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  e_booking_id: string;

  @Column({ type: 'text' })
  barcode_8digit: string;

  @Column({ type: 'uuid', nullable: true })
  salesman_id: string;

  @ManyToOne(() => EBooking, booking => booking.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'e_booking_id' })
  booking: EBooking;

  @ManyToOne(() => Salesman, { nullable: true })
  @JoinColumn({ name: 'salesman_id' })
  salesman: Salesman;
}
