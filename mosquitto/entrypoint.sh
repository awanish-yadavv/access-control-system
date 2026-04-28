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

# ── Resolve TLS certs ─────────────────────────────────────────
# Let's Encrypt stores real files under /etc/letsencrypt/archive/<domain>
# and exposes symlinks under /etc/letsencrypt/live/<domain>. `cp -L`
# dereferences them so mosquitto sees plain files in /mosquitto/certs/.
if [ -z "$MQTT_DOMAIN" ]; then
  echo "[MQTT] ERROR: MQTT_DOMAIN is not set. Aborting."
  exit 1
fi

CERT_SRC="/etc/letsencrypt/live/$MQTT_DOMAIN"
if [ ! -f "$CERT_SRC/fullchain.pem" ] || [ ! -f "$CERT_SRC/privkey.pem" ]; then
  echo "[MQTT] ERROR: Certs not found at $CERT_SRC. Did certbot run for $MQTT_DOMAIN?"
  exit 1
fi

mkdir -p /mosquitto/certs
cp -L "$CERT_SRC/fullchain.pem" /mosquitto/certs/fullchain.pem
cp -L "$CERT_SRC/privkey.pem"   /mosquitto/certs/privkey.pem
chmod 0644 /mosquitto/certs/fullchain.pem
chmod 0600 /mosquitto/certs/privkey.pem
echo "[MQTT] TLS certs loaded for $MQTT_DOMAIN."

# ── Start broker ──────────────────────────────────────────────
echo "[MQTT] Starting Mosquitto broker..."
exec mosquitto -c /mosquitto/config/mosquitto.conf
