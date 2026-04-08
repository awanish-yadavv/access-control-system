import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { AppDataSource } from '../data-source';
import { Role } from '../role/role.entity';
import { User } from '../user/user.entity';
import * as bcrypt from 'bcryptjs';
import { EntityPermissionMatrix } from '../types/permission.types';

const SYSTEM_ADMIN_MATRIX: EntityPermissionMatrix = {
  users:         { create: true, read: true, list: true, update: true, delete: true, export: true, manage: true },
  roles:         { create: true, read: true, list: true, update: true, delete: true, export: true, manage: true },
  tenants:       { create: true, read: true, list: true, update: true, delete: true, export: true, manage: true },
  devices:       { create: true, read: true, list: true, update: true, delete: true, export: true, manage: true },
  cards:         { create: true, read: true, list: true, update: true, delete: true, export: true, manage: true },
  plans:         { create: true, read: true, list: true, update: true, delete: true, export: true, manage: true },
  invoices:                { create: true, read: true, list: true, update: true, delete: true, export: true, manage: true },
  subscriptions:           { create: true, read: true, list: true, update: true, delete: true, export: true, manage: true },
  membership_plans:        { create: true, read: true, list: true, update: true, delete: true, export: true, manage: true },
  customer_subscriptions:  { create: true, read: true, list: true, update: true, delete: true, export: true, manage: true },
  customer_invoices:       { create: true, read: true, list: true, update: true, delete: true, export: true, manage: true },
  access_logs:             { create: true, read: true, list: true, update: true, delete: true, export: true, manage: true },
};

const TENANT_ADMIN_MATRIX: EntityPermissionMatrix = {
  users:         { create: true,  read: true,  list: true,  update: true,  delete: true,  export: true,  manage: true  },
  roles:         { create: false, read: true,  list: true,  update: false, delete: false, export: false, manage: false },
  tenants:       { create: false, read: true,  list: true,  update: true,  delete: false, export: false, manage: false },
  devices:       { create: false, read: true,  list: true,  update: true,  delete: false, export: true,  manage: true  },
  cards:         { create: true,  read: true,  list: true,  update: true,  delete: true,  export: true,  manage: true  },
  plans:         { create: false, read: true,  list: true,  update: false, delete: false, export: false, manage: false },
  invoices:               { create: false, read: true,  list: true,  update: true,  delete: false, export: true,  manage: false },
  subscriptions:          { create: false, read: true,  list: true,  update: false, delete: false, export: false, manage: true  },
  membership_plans:       { create: true,  read: true,  list: true,  update: true,  delete: true,  export: true,  manage: true  },
  customer_subscriptions: { create: true,  read: true,  list: true,  update: true,  delete: true,  export: true,  manage: true  },
  customer_invoices:      { create: true,  read: true,  list: true,  update: true,  delete: true,  export: true,  manage: true  },
  access_logs:            { create: false, read: true,  list: true,  update: false, delete: false, export: true,  manage: false },
};

const CUSTOMER_MATRIX: EntityPermissionMatrix = {
  users:         { create: false, read: false, list: false, update: false, delete: false, export: false, manage: false },
  roles:         { create: false, read: false, list: false, update: false, delete: false, export: false, manage: false },
  tenants:       { create: false, read: false, list: false, update: false, delete: false, export: false, manage: false },
  devices:       { create: false, read: false, list: false, update: false, delete: false, export: false, manage: false },
  cards:         { create: false, read: false, list: false, update: false, delete: false, export: false, manage: false },
  plans:         { create: false, read: false, list: false, update: false, delete: false, export: false, manage: false },
  invoices:               { create: false, read: false, list: false, update: false, delete: false, export: false, manage: false },
  subscriptions:          { create: false, read: false, list: false, update: false, delete: false, export: false, manage: false },
  membership_plans:       { create: false, read: false, list: false, update: false, delete: false, export: false, manage: false },
  customer_subscriptions: { create: false, read: true,  list: true,  update: false, delete: false, export: false, manage: false },
  customer_invoices:      { create: false, read: true,  list: true,  update: false, delete: false, export: false, manage: false },
  access_logs:            { create: false, read: true,  list: true,  update: false, delete: false, export: false, manage: false },
};

async function seed() {
  await AppDataSource.initialize();
  console.log('[Seed] Database connected');

  const roleRepo = AppDataSource.getRepository(Role);
  const userRepo = AppDataSource.getRepository(User);

  // Upsert SYSTEM_ADMIN role
  let adminRole = await roleRepo.findOne({ where: { name: 'SYSTEM_ADMIN' } });
  if (!adminRole) {
    adminRole = roleRepo.create({ name: 'SYSTEM_ADMIN', permissionMatrix: SYSTEM_ADMIN_MATRIX, isSystem: true });
  } else {
    adminRole.permissionMatrix = SYSTEM_ADMIN_MATRIX;
  }
  await roleRepo.save(adminRole);
  console.log('[Seed] Upserted SYSTEM_ADMIN role');

  // Upsert TENANT_ADMIN role
  let tenantAdminRole = await roleRepo.findOne({ where: { name: 'TENANT_ADMIN' } });
  if (!tenantAdminRole) {
    tenantAdminRole = roleRepo.create({ name: 'TENANT_ADMIN', permissionMatrix: TENANT_ADMIN_MATRIX, isSystem: false });
  } else {
    tenantAdminRole.permissionMatrix = TENANT_ADMIN_MATRIX;
  }
  await roleRepo.save(tenantAdminRole);
  console.log('[Seed] Upserted TENANT_ADMIN role');

  // Upsert CUSTOMER role
  let customerRole = await roleRepo.findOne({ where: { name: 'CUSTOMER' } });
  if (!customerRole) {
    customerRole = roleRepo.create({ name: 'CUSTOMER', permissionMatrix: CUSTOMER_MATRIX, isSystem: false });
  } else {
    customerRole.permissionMatrix = CUSTOMER_MATRIX;
  }
  await roleRepo.save(customerRole);
  console.log('[Seed] Upserted CUSTOMER role');

  // Upsert SYSTEM superuser
  const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@neyofit.io';
  const ADMIN_PASS  = process.env.SEED_ADMIN_PASS  || 'NeyoFit@Admin1';

  let adminUser = await userRepo.findOne({ where: { email: ADMIN_EMAIL } });
  if (!adminUser) {
    const passwordHash = await bcrypt.hash(ADMIN_PASS, 12);
    adminUser = userRepo.create({
      email: ADMIN_EMAIL,
      passwordHash,
      userType: 'SYSTEM',
      tenantId: null,
    });
    await userRepo.save(adminUser);
    console.log(`[Seed] Created admin user: ${ADMIN_EMAIL}`);
  } else {
    console.log(`[Seed] Admin user already exists: ${ADMIN_EMAIL}`);
  }

  // Assign role
  const userWithRoles = await userRepo.findOne({
    where: { id: adminUser.id },
    relations: ['roles'],
  });
  if (userWithRoles && !userWithRoles.roles?.find((r) => r.id === adminRole!.id)) {
    userWithRoles.roles = [...(userWithRoles.roles || []), adminRole];
    await userRepo.save(userWithRoles);
    console.log('[Seed] Assigned SYSTEM_ADMIN role to admin user');
  }

  await AppDataSource.destroy();
  console.log('[Seed] Done ✓');
}

seed().catch((err) => {
  console.error('[Seed] Failed:', err);
  process.exit(1);
});
