import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Role } from './Role';
import { Vendor } from './Vendor';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true, nullable: true })
  email: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', unique: true })
  mobile: string;

  @Column({ type: 'text' })
  password_hash: string;

  @Column({ type: 'text', default: 'Executor' })
  role: string;

  @Column({ type: 'uuid', nullable: true })
  role_id: string;

  @Column({ type: 'text', nullable: true })
  mapped_floor: string;

  @Column({ type: 'text', nullable: true })
  mapped_salesman: string;
  
  @Column({ type: 'uuid', nullable: true })
  vendor_id: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'int', default: 1 })
  token_version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => Role, role => role.users, { nullable: true })
  @JoinColumn({ name: 'role_id' })
  roles: Role;

  @ManyToOne(() => Vendor, { nullable: true })
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor;
}
