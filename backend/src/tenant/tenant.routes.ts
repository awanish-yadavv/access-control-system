import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { permissionGuard } from '../middleware/permission.middleware';
import {
  listTenants, getTenant, createTenant, updateTenant, deleteTenant,
  getTenantDevicesView, getTenantCardsView,
  getTenantSubscriptionsView, getTenantInvoicesView,
  subscribeTenant, updateTenantSubscriptionHandler,
  createTenantInvoiceHandler, updateTenantInvoiceHandler,
  listMembershipPlans, createMembershipPlanHandler, updateMembershipPlanHandler, deleteMembershipPlanHandler,
  listCustomerSubscriptions, createCustomerSubscriptionHandler, updateCustomerSubscriptionHandler,
  terminateCustomerSubscriptionHandler, cancelCustomerSubscriptionHandler, changeSubscriptionPlanHandler,
  listCustomerInvoices, createCustomerInvoiceHandler, getCustomerInvoiceByIdHandler, updateCustomerInvoiceHandler,
  getSystemSettingsHandler, updateSystemSettingsHandler,
  updateTenantCardHandler,
  updateTenantDeviceHandler,
  getCardAccessDevicesHandler,
  setCardAccessDevicesHandler,
  listTenantCustomers,
  createTenantCustomerHandler,
  removeTenantCustomerHandler,
} from './tenant.controller';

const router = Router();
const auth   = authMiddleware;

// ── Core CRUD ──────────────────────────────────────────────────────────────
router.get('/',       auth, permissionGuard('tenants', 'list'),   listTenants);
router.get('/:id',    auth, permissionGuard('tenants', 'read'),   getTenant);
router.post('/',      auth, permissionGuard('tenants', 'create'), createTenant);
router.patch('/:id',  auth, permissionGuard('tenants', 'update'), updateTenant);
router.delete('/:id', auth, permissionGuard('tenants', 'delete'), deleteTenant);

// ── Tenant-scoped customers ────────────────────────────────────────────────
router.get('/:id/customers',            auth, permissionGuard('users', 'list'),   listTenantCustomers);
router.post('/:id/customers',           auth, permissionGuard('users', 'create'), createTenantCustomerHandler);
router.delete('/:id/customers/:userId', auth, permissionGuard('users', 'delete'), removeTenantCustomerHandler);

// ── Tenant-scoped data views ───────────────────────────────────────────────
router.get('/:id/devices',                          auth, permissionGuard('devices', 'list'),   getTenantDevicesView);
router.patch('/:id/devices/:myDeviceId',            auth, permissionGuard('devices', 'update'), updateTenantDeviceHandler);
router.get('/:id/cards',                            auth, permissionGuard('cards',   'list'),   getTenantCardsView);
router.patch('/:id/cards/:myCardId',                auth, permissionGuard('cards',   'update'), updateTenantCardHandler);
router.get('/:id/cards/:myCardId/access-devices',   auth, permissionGuard('cards',   'read'),   getCardAccessDevicesHandler);
router.put('/:id/cards/:myCardId/access-devices',   auth, permissionGuard('cards',   'update'), setCardAccessDevicesHandler);

// ── Tier 1: NeyoFit platform subscriptions ────────────────────────────────
router.get('/:id/subscriptions',          auth, permissionGuard('subscriptions', 'list'),   getTenantSubscriptionsView);
router.post('/:id/subscriptions',         auth, permissionGuard('subscriptions', 'create'), subscribeTenant);
router.patch('/:id/subscriptions/:subId', auth, permissionGuard('subscriptions', 'update'), updateTenantSubscriptionHandler);

// ── Tier 1: NeyoFit platform invoices ─────────────────────────────────────
router.get('/:id/invoices',           auth, permissionGuard('invoices', 'list'),   getTenantInvoicesView);
router.post('/:id/invoices',          auth, permissionGuard('invoices', 'create'), createTenantInvoiceHandler);
router.patch('/:id/invoices/:invId',  auth, permissionGuard('invoices', 'update'), updateTenantInvoiceHandler);

// ── Tier 2: Tenant membership plans ───────────────────────────────────────
router.get('/:id/membership-plans',             auth, permissionGuard('membership_plans', 'list'),   listMembershipPlans);
router.post('/:id/membership-plans',            auth, permissionGuard('membership_plans', 'create'), createMembershipPlanHandler);
router.patch('/:id/membership-plans/:planId',   auth, permissionGuard('membership_plans', 'update'), updateMembershipPlanHandler);
router.delete('/:id/membership-plans/:planId',  auth, permissionGuard('membership_plans', 'delete'), deleteMembershipPlanHandler);

// ── Tier 2: Customer subscriptions ────────────────────────────────────────
router.get('/:id/customer-subscriptions',                          auth, permissionGuard('customer_subscriptions', 'list'),   listCustomerSubscriptions);
router.post('/:id/customer-subscriptions',                         auth, permissionGuard('customer_subscriptions', 'create'), createCustomerSubscriptionHandler);
router.patch('/:id/customer-subscriptions/:subId',                 auth, permissionGuard('customer_subscriptions', 'update'), updateCustomerSubscriptionHandler);
router.post('/:id/customer-subscriptions/:subId/terminate',        auth, permissionGuard('customer_subscriptions', 'update'), terminateCustomerSubscriptionHandler);
router.post('/:id/customer-subscriptions/:subId/cancel',           auth, permissionGuard('customer_subscriptions', 'update'), cancelCustomerSubscriptionHandler);
router.patch('/:id/customer-subscriptions/:subId/plan',            auth, permissionGuard('customer_subscriptions', 'update'), changeSubscriptionPlanHandler);

// ── Tier 2: Customer invoices ──────────────────────────────────────────────
router.get('/:id/customer-invoices',          auth, permissionGuard('customer_invoices', 'list'),   listCustomerInvoices);
router.post('/:id/customer-invoices',         auth, permissionGuard('customer_invoices', 'create'), createCustomerInvoiceHandler);
router.get('/:id/customer-invoices/:invId',   auth, permissionGuard('customer_invoices', 'read'),   getCustomerInvoiceByIdHandler);
router.patch('/:id/customer-invoices/:invId', auth, permissionGuard('customer_invoices', 'update'), updateCustomerInvoiceHandler);

// ── System settings (SYSTEM only) ──────────────────────────────────────────
router.get('/system/settings',   auth, permissionGuard('settings', 'list'),   getSystemSettingsHandler);
router.patch('/system/settings', auth, permissionGuard('settings', 'update'), updateSystemSettingsHandler);

export default router;
