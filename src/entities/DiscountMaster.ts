import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('discount_masters')
export class DiscountMaster {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  flag_name: string;

  @Column({ type: 'text', default: 'percentage' })
  discount_type: string;

  @Column({ type: 'numeric', default: 0 })
  default_value: number;

  @Column({ type: 'text', nullable: true })
  discount_code: string;

  @Column({ type: 'text', nullable: true })
  discount_name: string;

  @Column({ type: 'numeric', nullable: true })
  discount_value: number;

  @Column({ type: 'text', array: true, default: '{}' })
  applicable_product_groups: string[];

  @Column({ type: 'date', nullable: true })
  start_date: Date;

  @Column({ type: 'date', nullable: true })
  end_date: Date;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'boolean', default: false })
  is_voucher_only: boolean;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
