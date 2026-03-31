import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { EBooking } from './EBooking';
import { Salesman } from './Salesman';
import { SalesInvoice } from './SalesInvoice';

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

  @Column({ type: 'uuid', nullable: true })
  invoice_id: string;

  @Column({ type: 'text', default: 'booked' })
  status: string; // booked, invoiced, cancelled

  @ManyToOne(() => EBooking, booking => booking.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'e_booking_id' })
  booking: EBooking;

  @ManyToOne(() => Salesman, { nullable: true })
  @JoinColumn({ name: 'salesman_id' })
  salesman: Salesman;

  @ManyToOne(() => SalesInvoice, { nullable: true })
  @JoinColumn({ name: 'invoice_id' })
  invoice: SalesInvoice;
}
