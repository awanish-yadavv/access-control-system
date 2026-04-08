import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import * as dotenv from 'dotenv';

dotenv.config();

// System schema entities
import { Role } from './role/role.entity';
import { User } from './user/user.entity';
import { Tenant } from './tenant/tenant.entity';
import { Device } from './device/device.entity';
import { Card } from './card/card.entity';
import { Plan } from './plan/plan.entity';
import { AccessLog } from './access-log/access-log.entity';
import { RefreshToken } from './auth/refresh-token.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  schema: 'system',
  entities: [Role, User, Tenant, Device, Card, Plan, AccessLog, RefreshToken],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  namingStrategy: new SnakeNamingStrategy(),
});
