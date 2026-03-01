import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { City } from './City';

@Entity('vendors')
export class Vendor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  vendor_code: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', default: '' })
  address: string;

  @Column({ type: 'text', default: '' })
  gstin: string;

  @Column({ type: 'text', default: '' })
  mobile: string;

  @Column({ type: 'text', nullable: true })
  st_number: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'city_id', type: 'uuid', nullable: true })
  city_id: string;

  @ManyToOne(() => City, { nullable: true, eager: false })
  @JoinColumn({ name: 'city_id' })
  city: City;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
