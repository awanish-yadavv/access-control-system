import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../data-source';
import { Tenant } from './tenant.entity';
import { User } from '../user/user.entity';
import { Role } from '../role/role.entity';
import {
  provisionTenantSchema,
  dropTenantSchema,
  getTenantDevices,
  getTenantCards,
  getTenantSubscriptions,
  getTenantInvoices,
  createTenantSubscription,
  updateTenantSubscription,
  createTenantInvoice,
  updateTenantInvoice,
  getTenantMembershipPlans,
  createTenantMembershipPlan,
  updateTenantMembershipPlan,
  deleteTenantMembershipPlan,
  getCustomerSubscriptions,
  createCustomerSubscription,
  updateCustomerSubscription,
  terminateCustomerSubscription,
  cancelCustomerSubscription,
  changeSubscriptionPlan,
  getCustomerInvoices,
  createCustomerInvoice,
  getCustomerInvoiceById,
  updateCustomerInvoice,
  updateTenantCard,
  updateTenantDevice,
  getCardAccessDevices,
  setCardAccessDevices,
  getTenantCustomers,
  addCustomerToTenant,
  removeCustomerFromTenant,
} from '../service/tenant-schema.service';
import { apiSuccess, apiError } from '../utils/response';
import { param } from '../utils/params';

const repo = () => AppDataSource.getRepository(Tenant);

export const listTenants = async (_req: Request, res: Response): Promise<void> => {
  const tenants = await repo().find({ relations: ['owner'] });
  apiSuccess(res, tenants, 'Tenants fetched', 200);
};

export const getTenant = async (req: Request, res: Response): Promise<void> => {
  const tenant = await repo().findOne({ where: { id: param(req, 'id') }, relations: ['owner'] });
  if (!tenant) { apiError(res, null, 'Tenant not found', 404); return; }
  apiSuccess(res, tenant, 'Tenant fetched', 200);
};

export const createTenant = async (req: Request, res: Response): Promise<void> => {
  const { name, ownerId, email, phone } = req.body;
  if (!name || !ownerId) { apiError(res, null, 'name and ownerId are required', 400); return; }
  const owner = await AppDataSource.getRepository(User).findOne({ where: { id: ownerId } });
  if (!owner) { apiError(res, null, 'Owner user not found', 404); return; }
  const tenant = repo().create({ name, ownerId, email: email ?? null, phone: phone ?? null, status: 'active' });
  await repo().save(tenant);
  owner.tenantId = tenant.id;
  await AppDataSource.getRepository(User).save(owner);
  await provisionTenantSchema(tenant.id);
  apiSuccess(res, tenant, 'Tenant created', 201);
};

export const updateTenant = async (req: Request, res: Response): Promise<void> => {
  const tenant = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!tenant) { apiError(res, null, 'Tenant not found', 404); return; }
  const { name, status, email, phone,
          gstEnabled, gstType, gstin, gstLegalName, gstPan, gstRate, gstAddress, gstState, gstStateCode } = req.body;
  if (name   !== undefined) tenant.name   = name;
  if (status !== undefined) tenant.status = status;
  if (email  !== undefined) tenant.email  = email ?? null;
  if (phone  !== undefined) tenant.phone  = phone ?? null;
  if (gstEnabled    !== undefined) tenant.gstEnabled    = !!gstEnabled;
  if (gstType       !== undefined) tenant.gstType       = gstType;
  if (gstin         !== undefined) tenant.gstin         = gstin ?? null;
  if (gstLegalName  !== undefined) tenant.gstLegalName  = gstLegalName ?? null;
  if (gstPan        !== undefined) tenant.gstPan        = gstPan ?? null;
  if (gstRate       !== undefined) tenant.gstRate       = Number(gstRate);
  if (gstAddress    !== undefined) tenant.gstAddress    = gstAddress ?? null;
  if (gstState      !== undefined) tenant.gstState      = gstState ?? null;
  if (gstStateCode  !== undefined) tenant.gstStateCode  = gstStateCode ?? null;
  await repo().save(tenant);
  apiSuccess(res, tenant, 'Tenant updated', 200);
};

export const deleteTenant = async (req: Request, res: Response): Promise<void> => {
  const tenant = await repo().findOne({ where: { id: param(req, 'id') } });
  if (!tenant) { apiError(res, null, 'Tenant not found', 404); return; }
  // users.tenant_id has no FK; null it out so deleted tenants don't leave dangling refs
  await AppDataSource.query(
    `UPDATE system.users SET tenant_id = NULL WHERE tenant_id = $1`,
    [tenant.id],
  );
  await dropTenantSchema(tenant.id);
  await repo().remove(tenant);
  apiSuccess(res, null, 'Tenant deleted', 200);
};

export const getTenantDevicesView = async (req: Request, res: Response): Promise<void> => {
  const id = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  apiSuccess(res, await getTenantDevices(id), 'Tenant devices fetched', 200);
};

export const getTenantCardsView = async (req: Request, res: Response): Promise<void> => {
  const id = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  apiSuccess(res, await getTenantCards(id), 'Tenant cards fetched', 200);
};

export const getTenantSubscriptionsView = async (req: Request, res: Response): Promise<void> => {
  const id = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  apiSuccess(res, await getTenantSubscriptions(id), 'Subscriptions fetched', 200);
};

export const getTenantInvoicesView = async (req: Request, res: Response): Promise<void> => {
  const id = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  apiSuccess(res, await getTenantInvoices(id), 'Invoices fetched', 200);
};

// ── Tier 1 write handlers ────────────────────────────────────────────────────

export const subscribeTenant = async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const { planId, billingCycle, expiresAt, startsAt } = req.body;
  if (!planId || !billingCycle) { apiError(res, null, 'planId and billingCycle are required', 400); return; }
  try {
    const sub = await createTenantSubscription(
      tenantId, planId, billingCycle,
      expiresAt ? new Date(expiresAt) : null,
      startsAt ? new Date(startsAt) : undefined,
    );
    apiSuccess(res, sub, 'Subscription created', 201);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const updateTenantSubscriptionHandler = async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const subId    = param(req, 'subId');
  const { status, expiresAt, notes } = req.body;
  try {
    const sub = await updateTenantSubscription(tenantId, subId, {
      status,
      expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined,
      notes,
    });
    apiSuccess(res, sub, 'Subscription updated', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const createTenantInvoiceHandler = async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const { amount, subscriptionId, description, dueDate } = req.body;
  if (amount === undefined) { apiError(res, null, 'amount is required', 400); return; }
  try {
    const inv = await createTenantInvoice(tenantId, {
      amount, subscriptionId: subscriptionId ?? null,
      description: description ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
    });
    apiSuccess(res, inv, 'Invoice created', 201);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const updateTenantInvoiceHandler = async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const invId    = param(req, 'invId');
  const { status, paidAt } = req.body;
  try {
    const inv = await updateTenantInvoice(tenantId, invId, {
      status,
      paidAt: paidAt !== undefined ? (paidAt ? new Date(paidAt) : null) : undefined,
    });
    apiSuccess(res, inv, 'Invoice updated', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

// ── Tier 2: membership plans ─────────────────────────────────────────────────

export const listMembershipPlans = async (req: Request, res: Response): Promise<void> => {
  const id = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  apiSuccess(res, await getTenantMembershipPlans(id), 'Membership plans fetched', 200);
};

export const createMembershipPlanHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const { name, price, billingCycle, features, gstRate } = req.body;
  if (!name || price === undefined || !billingCycle) {
    apiError(res, null, 'name, price and billingCycle are required', 400); return;
  }
  try {
    const plan = await createTenantMembershipPlan(id, {
      name, price, billingCycle, features: features ?? {},
      gstRate: gstRate !== undefined ? Number(gstRate) : null,
    });
    apiSuccess(res, plan, 'Membership plan created', 201);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const updateMembershipPlanHandler = async (req: Request, res: Response): Promise<void> => {
  const id     = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const planId = param(req, 'planId');
  const { name, price, billingCycle, features, isActive, gstRate } = req.body;
  try {
    const plan = await updateTenantMembershipPlan(id, planId, {
      name, price, billingCycle, features, isActive,
      ...('gstRate' in req.body ? { gstRate: gstRate !== null ? Number(gstRate) : null } : {}),
    });
    apiSuccess(res, plan, 'Membership plan updated', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const deleteMembershipPlanHandler = async (req: Request, res: Response): Promise<void> => {
  const id     = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const planId = param(req, 'planId');
  try {
    await deleteTenantMembershipPlan(id, planId);
    apiSuccess(res, null, 'Membership plan deleted', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

// ── Tier 2: customer subscriptions ──────────────────────────────────────────

export const listCustomerSubscriptions = async (req: Request, res: Response): Promise<void> => {
  const id         = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const customerId = req.query.customerId as string | undefined;
  apiSuccess(res, await getCustomerSubscriptions(id, customerId), 'Customer subscriptions fetched', 200);
};

export const createCustomerSubscriptionHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const { customerId, planId, expiresAt, startsAt } = req.body;
  if (!customerId || !planId) { apiError(res, null, 'customerId and planId are required', 400); return; }
  try {
    const sub = await createCustomerSubscription(id, {
      customerId, planId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      startsAt:  startsAt  ? new Date(startsAt)  : undefined,
    });
    apiSuccess(res, sub, 'Customer subscription created', 201);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const updateCustomerSubscriptionHandler = async (req: Request, res: Response): Promise<void> => {
  const id    = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const subId = param(req, 'subId');
  const { status, expiresAt } = req.body;
  try {
    const sub = await updateCustomerSubscription(id, subId, {
      status,
      expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined,
    });
    apiSuccess(res, sub, 'Customer subscription updated', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const terminateCustomerSubscriptionHandler = async (req: Request, res: Response): Promise<void> => {
  const id    = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const subId = param(req, 'subId');
  try {
    const sub = await terminateCustomerSubscription(id, subId);
    apiSuccess(res, sub, 'Subscription terminated', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const cancelCustomerSubscriptionHandler = async (req: Request, res: Response): Promise<void> => {
  const id    = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const subId = param(req, 'subId');
  try {
    const sub = await cancelCustomerSubscription(id, subId);
    apiSuccess(res, sub, 'Subscription cancelled', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const changeSubscriptionPlanHandler = async (req: Request, res: Response): Promise<void> => {
  const id    = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const subId = param(req, 'subId');
  const { planId } = req.body;
  if (!planId) { apiError(res, null, 'planId is required', 400); return; }
  try {
    const sub = await changeSubscriptionPlan(id, subId, planId);
    apiSuccess(res, sub, 'Subscription plan changed', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

// ── Tier 2: customer invoices ────────────────────────────────────────────────

export const listCustomerInvoices = async (req: Request, res: Response): Promise<void> => {
  const id         = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const customerId = req.query.customerId as string | undefined;
  apiSuccess(res, await getCustomerInvoices(id, customerId), 'Customer invoices fetched', 200);
};

export const createCustomerInvoiceHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const { customerId, subscriptionId, amount, description, notes, dueDate } = req.body;
  if (!customerId || amount === undefined) {
    apiError(res, null, 'customerId and amount are required', 400); return;
  }
  try {
    const inv = await createCustomerInvoice(id, {
      customerId, subscriptionId: subscriptionId ?? null, amount,
      description: description ?? null,
      notes: notes ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
    });
    apiSuccess(res, inv, 'Customer invoice created', 201);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const getCustomerInvoiceByIdHandler = async (req: Request, res: Response): Promise<void> => {
  const id    = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const invId = param(req, 'invId');
  try {
    const inv = await getCustomerInvoiceById(id, invId);
    if (!inv) { apiError(res, null, 'Invoice not found', 404); return; }
    apiSuccess(res, inv, 'Invoice fetched', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const updateCustomerInvoiceHandler = async (req: Request, res: Response): Promise<void> => {
  const id    = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const invId = param(req, 'invId');
  const { status, paidAt } = req.body;
  try {
    const inv = await updateCustomerInvoice(id, invId, {
      status,
      paidAt: paidAt !== undefined ? (paidAt ? new Date(paidAt) : null) : undefined,
    });
    apiSuccess(res, inv, 'Customer invoice updated', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

// ── Tenant card management ───────────────────────────────────────────────────

export const updateTenantCardHandler = async (req: Request, res: Response): Promise<void> => {
  const id       = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const myCardId = param(req, 'myCardId');
  const { customerId, label } = req.body;
  try {
    const card = await updateTenantCard(id, myCardId, { customerId, label });
    apiSuccess(res, card, 'Card updated', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

// ── Tenant device management ─────────────────────────────────────────────────

export const updateTenantDeviceHandler = async (req: Request, res: Response): Promise<void> => {
  const id         = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const myDeviceId = param(req, 'myDeviceId');
  const { label, notes } = req.body;
  try {
    const device = await updateTenantDevice(id, myDeviceId, { label, notes });
    apiSuccess(res, device, 'Device updated', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const getCardAccessDevicesHandler = async (req: Request, res: Response): Promise<void> => {
  const id       = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const myCardId = param(req, 'myCardId');
  try {
    apiSuccess(res, await getCardAccessDevices(id, myCardId), 'Access devices fetched', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const setCardAccessDevicesHandler = async (req: Request, res: Response): Promise<void> => {
  const id       = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const myCardId = param(req, 'myCardId');
  const { deviceIds } = req.body;
  if (!Array.isArray(deviceIds)) { apiError(res, null, 'deviceIds must be an array', 400); return; }
  try {
    await setCardAccessDevices(id, myCardId, deviceIds);
    apiSuccess(res, null, 'Access rules updated', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

// ── Tenant-scoped customer management ────────────────────────────────────────

export const listTenantCustomers = async (req: Request, res: Response): Promise<void> => {
  const id = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  try {
    apiSuccess(res, await getTenantCustomers(id), 'Customers fetched', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const createTenantCustomerHandler = async (req: Request, res: Response): Promise<void> => {
  const id = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const { email, password, name, phone } = req.body;
  if (!email || !password) { apiError(res, null, 'email and password are required', 400); return; }

  const userRepo = AppDataSource.getRepository(User);
  const roleRepo = AppDataSource.getRepository(Role);

  try {
    // Find-or-create the user in system.users
    let user = await userRepo.findOne({ where: { email }, relations: ['roles'] });
    if (!user) {
      const passwordHash = await bcrypt.hash(password, 12);
      user = userRepo.create({ email, passwordHash, userType: 'CUSTOMER', tenantId: null });
      await userRepo.save(user);
      user = await userRepo.findOne({ where: { id: user.id }, relations: ['roles'] }) ?? user;
    }

    // Assign CUSTOMER role if not already assigned
    const customerRole = await roleRepo.findOne({ where: { name: 'CUSTOMER' } });
    if (customerRole && !user.roles?.find(r => r.id === customerRole.id)) {
      user.roles = [...(user.roles ?? []), customerRole];
      await userRepo.save(user);
    }

    // Enroll in this tenant's my_customers with tenant-scoped profile
    await addCustomerToTenant(id, user.id, { name: name ?? null, phone: phone ?? null });

    const { passwordHash: _, ...safeUser } = user as User & { passwordHash: string };
    apiSuccess(res, safeUser, 'Customer added', 201);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const removeTenantCustomerHandler = async (req: Request, res: Response): Promise<void> => {
  const id     = req.user!.userType === 'SYSTEM' ? param(req, 'id') : req.user!.tenantId!;
  const userId = param(req, 'userId');
  try {
    await removeCustomerFromTenant(id, userId);
    apiSuccess(res, null, 'Customer removed from tenant', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

// ── System settings ──────────────────────────────────────────────────────────

export const getSystemSettingsHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await AppDataSource.query(
      `SELECT key, value FROM system.settings`,
    ) as { key: string; value: unknown }[];
    const settings: Record<string, unknown> = {};
    for (const row of rows) { settings[row.key] = row.value; }
    apiSuccess(res, settings, 'Settings fetched', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};

export const updateSystemSettingsHandler = async (req: Request, res: Response): Promise<void> => {
  const { key, value } = req.body;
  if (!key || value === undefined) { apiError(res, null, 'key and value are required', 400); return; }
  try {
    await AppDataSource.query(
      `INSERT INTO system.settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, JSON.stringify(value)],
    );
    apiSuccess(res, { key, value }, 'Settings updated', 200);
  } catch (err: unknown) { apiError(res, err, (err as Error).message, 500); }
};
