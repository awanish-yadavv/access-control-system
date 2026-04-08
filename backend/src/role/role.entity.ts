import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToMany,
} from 'typeorm';
import { EntityPermissionMatrix } from '../types/permission.types';
import { User } from '../user/user.entity';

@Entity({ schema: 'system', name: 'roles' })
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'jsonb', default: {} })
  permissionMatrix: EntityPermissionMatrix;

  @Column({ default: false })
  isSystem: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToMany(() => User, (user) => user.roles)
  users: User[];
}
