import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { EBooking } from './EBooking';

@Entity('e_booking_items')
export class EBookingItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  e_booking_id: string;

  @Column({ type: 'text' })
  barcode_8digit: string;

  @ManyToOne(() => EBooking, booking => booking.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'e_booking_id' })
  booking: EBooking;
}
