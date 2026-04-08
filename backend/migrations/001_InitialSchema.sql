-- ============================================================
-- NeyoFit Access Control — Initial Schema
-- Run once against a fresh database
-- ============================================================

-- 1. Create the system schema (global platform tables)
CREATE SCHEMA IF NOT EXISTS system;

-- 2. ROLES
CREATE TABLE IF NOT EXISTS system.roles (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(100)  NOT NULL UNIQUE,
    permission_matrix JSONB         NOT NULL DEFAULT '{}',
    is_system         BOOLEAN       NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 3. USERS
CREATE TABLE IF NOT EXISTS system.users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    user_type     VARCHAR(20)  NOT NULL CHECK (user_type IN ('SYSTEM','TENANT','CUSTOMER')),
    tenant_id     UUID         NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 4. USER_ROLES (join table)
CREATE TABLE IF NOT EXISTS system.user_roles (
    user_id UUID NOT NULL REFERENCES system.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES system.roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- 5. TENANTS
CREATE TABLE IF NOT EXISTS system.tenants (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    owner_id        UUID         NOT NULL REFERENCES system.users(id),
    email           VARCHAR(255) NULL,
    phone           VARCHAR(50)  NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','inactive')),
    -- GST / Business info
    gst_enabled     BOOLEAN      NOT NULL DEFAULT false,
    gst_type        VARCHAR(10)  NOT NULL DEFAULT 'cgst_sgst',
    gstin           VARCHAR(15)  NULL,
    gst_legal_name  VARCHAR(255) NULL,
    gst_pan         VARCHAR(10)  NULL,
    gst_rate        NUMERIC(5,2) NOT NULL DEFAULT 18.00,
    gst_address     TEXT         NULL,
    gst_state       VARCHAR(100) NULL,
    gst_state_code  VARCHAR(2)   NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- System-level key-value settings
CREATE TABLE IF NOT EXISTS system.settings (
    key        VARCHAR(100) PRIMARY KEY,
    value      JSONB        NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
INSERT INTO system.settings (key, value) VALUES
  ('gst', '{"defaultRate": 18, "platformGstin": null, "platformLegalName": null, "platformAddress": null}')
ON CONFLICT (key) DO NOTHING;

-- 6. DEVICES
CREATE TABLE IF NOT EXISTS system.devices (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    mac_address VARCHAR(17)  NOT NULL UNIQUE,
    name        VARCHAR(255) NULL,
    tenant_id   UUID         NULL REFERENCES system.tenants(id) ON DELETE SET NULL,
    status      VARCHAR(10)  NOT NULL DEFAULT 'offline' CHECK (status IN ('online','offline')),
    last_seen   TIMESTAMPTZ  NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devices_mac    ON system.devices(mac_address);
CREATE INDEX IF NOT EXISTS idx_devices_tenant ON system.devices(tenant_id);

-- 7. CARDS
CREATE TABLE IF NOT EXISTS system.cards (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    uid          VARCHAR(20)  NOT NULL UNIQUE,
    tenant_id    UUID         NULL REFERENCES system.tenants(id) ON DELETE SET NULL,
    assigned_to  UUID         NULL REFERENCES system.users(id) ON DELETE SET NULL,
    status       VARCHAR(10)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cards_uid      ON system.cards(uid);
CREATE INDEX IF NOT EXISTS idx_cards_tenant   ON system.cards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cards_assigned ON system.cards(assigned_to);

-- 8. PLANS
CREATE TABLE IF NOT EXISTS system.plans (
    id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(100)  NOT NULL,
    price      NUMERIC(10,2) NOT NULL,
    features   JSONB         NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 9. ACCESS LOGS (immutable audit trail)
CREATE TABLE IF NOT EXISTS system.access_logs (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id  UUID         NULL REFERENCES system.devices(id) ON DELETE SET NULL,
    card_uid   VARCHAR(20)  NOT NULL,
    tenant_id  UUID         NULL REFERENCES system.tenants(id) ON DELETE SET NULL,
    user_id    UUID         NULL REFERENCES system.users(id) ON DELETE SET NULL,
    result     VARCHAR(10)  NOT NULL CHECK (result IN ('granted','denied')),
    reason     VARCHAR(100) NOT NULL,
    trace_id   UUID         NOT NULL DEFAULT gen_random_uuid(),
    timestamp  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_access_logs_tenant    ON system.access_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_device    ON system.access_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_card      ON system.access_logs(card_uid);
CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON system.access_logs(timestamp DESC);

-- 10. REFRESH TOKENS
CREATE TABLE IF NOT EXISTS system.refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES system.users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON system.refresh_tokens(user_id);

-- ============================================================
-- TypeORM migrations tracking table
-- ============================================================
CREATE TABLE IF NOT EXISTS system.migrations (
    id          SERIAL       PRIMARY KEY,
    timestamp   BIGINT       NOT NULL,
    name        VARCHAR(255) NOT NULL
);
