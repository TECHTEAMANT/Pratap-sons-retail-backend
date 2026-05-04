import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { User } from './User';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'boolean', default: false })
  can_view_cost: boolean;

  @Column({ type: 'boolean', default: true })
  can_view_mrp: boolean;

  @Column({ type: 'boolean', default: false })
  can_manage_purchases: boolean;

  @Column({ type: 'boolean', default: false })
  can_manage_sales: boolean;

  @Column({ type: 'boolean', default: false })
  can_view_reports: boolean;

  @Column({ type: 'boolean', default: false })
  can_manage_inventory: boolean;

  @Column({ type: 'boolean', default: false })
  can_manage_masters: boolean;

  @Column({ type: 'boolean', default: false })
  can_manage_users: boolean;

  @Column({ type: 'boolean', default: true })
  can_view_dashboard: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @OneToMany(() => User, user => user.roles)
  users: User[];
}
