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

export type CardStatus = 'active' | 'inactive';

@Entity({ schema: 'system', name: 'cards' })
@Index(['uid'], { unique: true })
@Index(['tenantId'])
export class Card {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Uppercase hex UID e.g. "A3F29C01"
  @Column({ unique: true, length: 20 })
  uid: string;

  @Column({ nullable: true, type: 'uuid' })
  tenantId: string | null;

  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @Column({ default: 'active' })
  status: CardStatus;

  @CreateDateColumn()
  createdAt: Date;
}
