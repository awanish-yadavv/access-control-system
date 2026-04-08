import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

export type TenantStatus = 'active' | 'suspended' | 'inactive';

@Entity({ schema: 'system', name: 'tenants' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ nullable: true, type: 'varchar', length: 255 })
  email: string | null;

  @Column({ nullable: true, type: 'varchar', length: 50 })
  phone: string | null;

  @Column({ default: 'active' })
  status: TenantStatus;

  @Column({ name: 'gst_enabled', default: false })
  gstEnabled: boolean;

  @Column({ name: 'gst_type', default: 'cgst_sgst', type: 'varchar', length: 10 })
  gstType: 'igst' | 'cgst_sgst';

  @Column({ nullable: true, type: 'varchar', length: 15, name: 'gstin' })
  gstin: string | null;

  @Column({ nullable: true, type: 'varchar', length: 255, name: 'gst_legal_name' })
  gstLegalName: string | null;

  @Column({ nullable: true, type: 'varchar', length: 10, name: 'gst_pan' })
  gstPan: string | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 18.00, name: 'gst_rate' })
  gstRate: number;

  @Column({ nullable: true, type: 'text', name: 'gst_address' })
  gstAddress: string | null;

  @Column({ nullable: true, type: 'varchar', length: 100, name: 'gst_state' })
  gstState: string | null;

  @Column({ nullable: true, type: 'varchar', length: 2, name: 'gst_state_code' })
  gstStateCode: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
