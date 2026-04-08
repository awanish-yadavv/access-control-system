import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  Generated,
} from 'typeorm';
import { Device } from '../device/device.entity';
import { Tenant } from '../tenant/tenant.entity';
import { User } from '../user/user.entity';

export type AccessResult = 'granted' | 'denied';

@Entity({ schema: 'system', name: 'access_logs' })
@Index(['tenantId'])
@Index(['deviceId'])
@Index(['cardUid'])
export class AccessLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true, type: 'uuid' })
  deviceId: string | null;

  @ManyToOne(() => Device, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device: Device | null;

  @Column({ length: 20 })
  cardUid: string;

  @Column({ nullable: true, type: 'uuid' })
  tenantId: string | null;

  @ManyToOne(() => Tenant, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @Column({ nullable: true, type: 'uuid' })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'varchar', length: 10 })
  result: AccessResult;

  @Column({ length: 100 })
  reason: string;

  @Column({ type: 'uuid' })
  @Generated('uuid')
  traceId: string;

  @CreateDateColumn({ name: 'timestamp' })
  @Index()
  timestamp: Date;
}
