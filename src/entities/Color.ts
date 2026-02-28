import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('colors')
export class Color {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  color_code: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', default: '#000000' })
  hex_value: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
