-- Migration 003: Add RSA public key column to system.devices
-- Each device generates an RSA-2048 key pair on first boot.
-- The admin copies the public key from the device web dashboard and pastes it here.
ALTER TABLE system.devices
  ADD COLUMN IF NOT EXISTS public_key TEXT NULL;
