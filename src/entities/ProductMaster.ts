import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Vendor } from './Vendor';
import { ProductGroup } from './ProductGroup';
import { Color } from './Color';
import { Floor } from './Floor';

@Entity('product_masters')
export class ProductMaster {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  design_no: string;

  @Column({ name: 'product_group', type: 'text', nullable: true })
  product_group_id: string;

  @ManyToOne(() => ProductGroup)
  @JoinColumn({ name: 'product_group', referencedColumnName: 'id' })
  product_group: ProductGroup;

  @Column({ name: 'color', type: 'text', nullable: true })
  color_id: string;

  @ManyToOne(() => Color)
  @JoinColumn({ name: 'color', referencedColumnName: 'id' })
  color: Color;

  @Column({ name: 'vendor', type: 'text', nullable: true })
  vendor_id: string;

  @ManyToOne(() => Vendor)
  @JoinColumn({ name: 'vendor', referencedColumnName: 'id' })
  vendor: Vendor;

  @Column({ type: 'numeric', default: 0 })
  mrp: number;

  @Column({ type: 'text', default: 'AUTO_5_18' })
  gst_logic: string;

  @Column({ type: 'text', nullable: true })
  hsn_code: string;

  @Column({ name: 'floor', type: 'text', nullable: true })
  floor_id: string;

  @ManyToOne(() => Floor)
  @JoinColumn({ name: 'floor', referencedColumnName: 'id' })
  floor: Floor;

  @Column({ type: 'text', array: true, default: '{}' })
  photos: string[];

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'int', default: 1 })
  barcodes_per_item: number;

  @Column({ type: 'text', nullable: true })
  payout_code: string;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
