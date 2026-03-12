import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('loyalty_config')
export class LoyaltyConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'numeric', default: 0 })
  points_per_rupee!: number;

  @Column({ type: 'numeric', default: 0 })
  redemption_value_per_point!: number;

  @Column({ type: 'numeric', default: 0 })
  min_invoice_value!: number;

  @Column({ type: 'numeric', default: 100 })
  max_redeem_percentage!: number;

  @Column({ type: 'numeric', default: 250 })
  birthday_points!: number;

  @Column({ type: 'numeric', default: 250 })
  anniversary_points!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
