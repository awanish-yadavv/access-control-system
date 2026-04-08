import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../tenant/tenant.entity';

export type DeviceStatus = 'online' | 'offline';

@Entity({ schema: 'system', name: 'devices' })
@Index(['macAddress'], { unique: true })
@Index(['tenantId'])
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Stored as "AA:BB:CC:DD:EE:FF"
  @Column({ unique: true, length: 17 })
  macAddress: string;

  @Column({ nullable: true, type: 'varchar' })
  name: string | null;

  @Column({ nullable: true, type: 'uuid' })
  tenantId: string | null;

  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @Column({ default: 'offline' })
  status: DeviceStatus;

  @Column({ nullable: true, type: 'timestamptz' })
  lastSeen: Date | null;

  @Column({ nullable: true, type: 'text', name: 'public_key' })
  publicKey: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
