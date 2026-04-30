-- ============================================================
-- Drop system.cards.assigned_to
--
-- Customer ↔ card is a tenant-private fact and lives in
-- tenant_<id>.my_cards.customer_id. The system.cards.assigned_to
-- column was a denormalised duplicate that drifted from the
-- tenant table and complicated the MQTT access path. Tenant
-- my_cards is now the single source of truth.
-- ============================================================

ALTER TABLE system.cards DROP COLUMN IF EXISTS assigned_to;
DROP INDEX IF EXISTS system.idx_cards_assigned;
