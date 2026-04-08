-- ============================================================
-- NeyoFit — Tenant Schema Template
-- Replace :tenantId with the actual tenant UUID (no dashes)
-- This is executed dynamically by TenantSchemaService.provision()
-- ============================================================

CREATE SCHEMA IF NOT EXISTS "tenant_:tenantId";

-- ── Human-readable ID sequences ───────────────────────────────
CREATE SEQUENCE IF NOT EXISTS "tenant_:tenantId".member_code_seq       START 1;
CREATE SEQUENCE IF NOT EXISTS "tenant_:tenantId".subscription_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS "tenant_:tenantId".invoice_code_seq      START 1;

-- ── Devices assigned to this tenant ──────────────────────────
CREATE TABLE IF NOT EXISTS "tenant_:tenantId".my_devices (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id   UUID         NOT NULL REFERENCES system.devices(id) ON DELETE CASCADE,
    label       VARCHAR(255) NULL,
    notes       TEXT         NULL,
    assigned_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (device_id)
);
CREATE INDEX IF NOT EXISTS idx_my_devices_device ON "tenant_:tenantId".my_devices(device_id);

-- ── Card-device access rules ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tenant_:tenantId".card_access_rules (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    my_card_id   UUID NOT NULL REFERENCES "tenant_:tenantId".my_cards(id)   ON DELETE CASCADE,
    my_device_id UUID NOT NULL REFERENCES "tenant_:tenantId".my_devices(id) ON DELETE CASCADE,
    UNIQUE (my_card_id, my_device_id)
);
CREATE INDEX IF NOT EXISTS idx_car_card   ON "tenant_:tenantId".card_access_rules(my_card_id);
CREATE INDEX IF NOT EXISTS idx_car_device ON "tenant_:tenantId".card_access_rules(my_device_id);

-- ── Cards issued to this tenant ───────────────────────────────
CREATE TABLE IF NOT EXISTS "tenant_:tenantId".my_cards (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id     UUID         NOT NULL REFERENCES system.cards(id) ON DELETE CASCADE,
    customer_id UUID         NULL REFERENCES system.users(id) ON DELETE SET NULL,
    label       VARCHAR(255) NULL,
    issued_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (card_id)
);
CREATE INDEX IF NOT EXISTS idx_my_cards_card     ON "tenant_:tenantId".my_cards(card_id);
CREATE INDEX IF NOT EXISTS idx_my_cards_customer ON "tenant_:tenantId".my_cards(customer_id);

-- ── Customers belonging to this tenant ───────────────────────
CREATE TABLE IF NOT EXISTS "tenant_:tenantId".my_customers (
    id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    code      VARCHAR(20)  NOT NULL UNIQUE DEFAULT ('MEM-' || LPAD(nextval('"tenant_:tenantId".member_code_seq')::text, 4, '0')),
    user_id   UUID         NOT NULL REFERENCES system.users(id) ON DELETE CASCADE,
    name      VARCHAR(255) NULL,
    phone     VARCHAR(50)  NULL,
    joined_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (user_id)
);

-- ── Tier 1: NeyoFit platform subscriptions for this tenant ───
CREATE TABLE IF NOT EXISTS "tenant_:tenantId".subscriptions (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id       UUID          NOT NULL REFERENCES system.plans(id),
    status        VARCHAR(20)   NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','expired','cancelled')),
    starts_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ   NULL,
    billing_cycle VARCHAR(20)   NOT NULL DEFAULT 'monthly'
                  CHECK (billing_cycle IN ('monthly','annual','one_time')),
    notes         TEXT          NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Tier 1: NeyoFit platform invoices for this tenant ────────
CREATE TABLE IF NOT EXISTS "tenant_:tenantId".invoices (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID          NULL
                    REFERENCES "tenant_:tenantId".subscriptions(id) ON DELETE SET NULL,
    amount          NUMERIC(10,2) NOT NULL,
    description     TEXT          NULL,
    status          VARCHAR(20)   NOT NULL DEFAULT 'unpaid'
                    CHECK (status IN ('unpaid','paid','void')),
    due_date        TIMESTAMPTZ   NULL,
    paid_at         TIMESTAMPTZ   NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Tier 2: Tenant's own membership plans ────────────────────
-- These are the gym's pricing tiers for their customers (independent of system.plans)
CREATE TABLE IF NOT EXISTS "tenant_:tenantId".membership_plans (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(255)  NOT NULL,
    price         NUMERIC(10,2) NOT NULL,
    billing_cycle VARCHAR(20)   NOT NULL DEFAULT 'monthly'
                  CHECK (billing_cycle IN ('monthly','annual','one_time')),
    features      JSONB         NOT NULL DEFAULT '{}',
    gst_rate      NUMERIC(5,2)  NULL,
    is_active     BOOLEAN       NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Tier 2: Customer subscriptions to membership plans ───────
CREATE TABLE IF NOT EXISTS "tenant_:tenantId".customer_subscriptions (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code              VARCHAR(20) NOT NULL UNIQUE DEFAULT ('SUB-' || LPAD(nextval('"tenant_:tenantId".subscription_code_seq')::text, 4, '0')),
    customer_id       UUID        NOT NULL REFERENCES system.users(id) ON DELETE CASCADE,
    plan_id           UUID        NOT NULL
                      REFERENCES "tenant_:tenantId".membership_plans(id) ON DELETE RESTRICT,
    status            VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','expired','cancelled','terminated')),
    starts_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ NULL,
    next_billing_date TIMESTAMPTZ NULL,
    cancelled_at      TIMESTAMPTZ NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_subs_customer ON "tenant_:tenantId".customer_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_subs_plan     ON "tenant_:tenantId".customer_subscriptions(plan_id);

-- ── Tier 2: Customer invoices ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "tenant_:tenantId".customer_invoices (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(20)   NOT NULL UNIQUE DEFAULT ('INV-' || LPAD(nextval('"tenant_:tenantId".invoice_code_seq')::text, 4, '0')),
    customer_id     UUID          NOT NULL REFERENCES system.users(id) ON DELETE CASCADE,
    subscription_id UUID          NULL
                    REFERENCES "tenant_:tenantId".customer_subscriptions(id) ON DELETE SET NULL,
    amount          NUMERIC(10,2) NOT NULL,
    gst_rate        NUMERIC(5,2)  NULL,
    gst_amount      NUMERIC(10,2) NULL,
    description     TEXT          NULL,
    notes           TEXT          NULL,
    status          VARCHAR(20)   NOT NULL DEFAULT 'unpaid'
                    CHECK (status IN ('unpaid','paid','void')),
    due_date        TIMESTAMPTZ   NULL,
    paid_at         TIMESTAMPTZ   NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_inv_customer ON "tenant_:tenantId".customer_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_inv_sub      ON "tenant_:tenantId".customer_invoices(subscription_id);
