import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BarcodePrintLog } from './BarcodePrintLog';
import { Vendor } from './Vendor';
import { ProductGroup } from './ProductGroup';
import { Color } from './Color';
import { Size } from './Size';
import { Floor } from './Floor';

@Entity('barcode_batches')
export class BarcodeBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  barcode_alias_8digit: string;

  @Column({ type: 'text', nullable: true })
  barcode_structured: string;

  @Index()
  @Column({ type: 'text' })
  design_no: string;

  @Column({ name: 'product_group', type: 'uuid', nullable: true })
  product_group_id: string;

  @ManyToOne(() => ProductGroup)
  @JoinColumn({ name: 'product_group', referencedColumnName: 'id' })
  product_group: ProductGroup;

  @Column({ name: 'size', type: 'uuid', nullable: true })
  size_id: string;

  @ManyToOne(() => Size)
  @JoinColumn({ name: 'size', referencedColumnName: 'id' })
  size: Size;

  @Column({ name: 'color', type: 'uuid', nullable: true })
  color_id: string;

  @ManyToOne(() => Color)
  @JoinColumn({ name: 'color', referencedColumnName: 'id' })
  color: Color;

  @Index()
  @Column({ name: 'vendor', type: 'uuid', nullable: true })
  vendor_id: string;

  @ManyToOne(() => Vendor)
  @JoinColumn({ name: 'vendor', referencedColumnName: 'id' })
  vendor: Vendor;

  @Column({ type: 'text', nullable: true })
  payout_code: string;

  @Column({ type: 'numeric', default: 0 })
  cost_actual: number;

  @Column({ type: 'text', nullable: true })
  cost_encoded: string;

  @Column({ type: 'numeric', default: 0 })
  mrp: number;

  @Column({ type: 'numeric', nullable: true, default: 0 })
  mrp_markup_percent: number;

  @Column({ type: 'text', nullable: true })
  hsn_code: string;

  @Column({ type: 'text', default: 'AUTO_5_18' })
  gst_logic: string;

  @Column({ type: 'int', default: 0 })
  total_quantity: number;

  @Column({ type: 'int', default: 0 })
  available_quantity: number;

  @Column({ type: 'int', nullable: true, default: null })
  print_quantity: number;

  @Column({ type: 'text', nullable: true })
  order_number: string;

  @Index()
  @Column({ name: 'floor', type: 'uuid', nullable: true })
  floor_id: string;

  @ManyToOne(() => Floor)
  @JoinColumn({ name: 'floor', referencedColumnName: 'id' })
  floor: Floor;

  @Column({ type: 'text', nullable: true })
  discount_type: string;

  @Column({ type: 'numeric', nullable: true })
  discount_value: number;

  @Column({ type: 'date', nullable: true })
  discount_start_date: Date;

  @Column({ type: 'date', nullable: true })
  discount_end_date: Date;

  @Index()
  @Column({ type: 'text', default: 'active' })
  status: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  po_id: string;

  @Column({ type: 'text', array: true, default: '{}' })
  photos: string[];

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @Column({ type: 'uuid', nullable: true })
  modified_by: string;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Relations
  @OneToMany(() => BarcodePrintLog, log => log.barcodeBatch)
  printLogs: BarcodePrintLog[];
}
