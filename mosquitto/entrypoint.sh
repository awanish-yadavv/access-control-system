#!/bin/sh
set -e

# ── Validate required env vars ─────────────────────────────────
for VAR in MQTT_BACKEND_USER MQTT_BACKEND_PASSWORD MQTT_DEVICE_USER MQTT_DEVICE_PASSWORD; do
  eval VAL=\$$VAR
  if [ -z "$VAL" ]; then
    echo "[MQTT] ERROR: $VAR is not set. Aborting."
    exit 1
  fi
done

# ── Generate ACL file from template ───────────────────────────
echo "[MQTT] Generating ACL from template..."
envsubst < /mosquitto/config/acl.conf.template > /mosquitto/config/acl.conf

# ── Generate passwd file from env vars ────────────────────────
# Passwords never sit in any file on disk — regenerated fresh each start.
echo "[MQTT] Generating password file..."
rm -f /mosquitto/config/passwd

mosquitto_passwd -b -c /mosquitto/config/passwd \
  "$MQTT_BACKEND_USER" "$MQTT_BACKEND_PASSWORD"

mosquitto_passwd -b /mosquitto/config/passwd \
  "$MQTT_DEVICE_USER" "$MQTT_DEVICE_PASSWORD"

chmod 0600 /mosquitto/config/passwd
echo "[MQTT] Password file ready."

# ── Start broker ──────────────────────────────────────────────
echo "[MQTT] Starting Mosquitto broker..."
exec mosquitto -c /mosquitto/config/mosquitto.conf
