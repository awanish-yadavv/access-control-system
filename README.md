# Access Control System

A multi-tenant IoT physical access control platform. RFID cards are scanned by ESP32 devices, the scan is sent encrypted over MQTT to a centralized backend, and the backend makes the access decision and responds. All authentication logic lives on the server — devices are dumb endpoints.

---

## 1. Project Information

| | |
|---|---|
| **Platform** | Multi-tenant SaaS — one backend serves many gyms / facilities |
| **Device** | ESP32 + RC522 RFID reader |
| **Communication** | MQTT over TLS (device ↔ broker) + REST + Socket.io (browser ↔ backend) |
| **Encryption** | RSA-2048 OAEP application-level encryption on all MQTT payloads |
| **Backend** | Node.js, Express, TypeScript, TypeORM, PostgreSQL |
| **Frontend** | Next.js (App Router), React, Tailwind CSS |
| **Queue** | BullMQ (subscription billing scheduler) |
| **Cache / Queue store** | Valkey (Redis-compatible) |
| **MQTT Broker** | Mosquitto (self-hosted, Docker) |

### User Roles

| Role | Description |
|---|---|
| **SYSTEM** | Platform operator — manages tenants, devices, cards, billing |
| **TENANT** | Customer (e.g. a gym) — manages their members, subscriptions, invoices |
| **CUSTOMER** | End user — holds an RFID card assigned by a tenant |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser / Admin                          │
│              Next.js Dashboard  (port 3000)                     │
│         SYSTEM dashboard  +  TENANT dashboard                   │
└─────────────────────┬───────────────────────────────────────────┘
                      │  REST API + Socket.io
┌─────────────────────▼───────────────────────────────────────────┐
│                   Node.js Backend  (port 5001)                  │
│  Express · TypeORM · BullMQ · Socket.io · JWT + RefreshToken    │
│                                                                 │
│  /api/auth          /api/tenants       /api/devices             │
│  /api/users         /api/cards         /api/access-logs         │
│  /api/roles         /api/plans                                  │
└──────┬──────────────────────────────────────┬───────────────────┘
       │  PostgreSQL (TypeORM)                 │  MQTT (internal, port 1883)
       │                                      │
┌──────▼──────┐                    ┌──────────▼──────────────────┐
│  PostgreSQL │                    │  Mosquitto MQTT Broker      │
│  (host DB)  │                    │  port 1883 — internal       │
└─────────────┘                    │  port 8883 — TLS, public    │
                                   └──────────┬──────────────────┘
┌──────────────┐                              │  MQTT over TLS (port 8883)
│    Valkey    │                   ┌──────────▼──────────────────┐
│  (BullMQ)   │                   │  ESP32 Device               │
└──────────────┘                  │  RC522 RFID · Relay · LEDs  │
                                  │  Buzzer · NTP · Web UI      │
                                  └─────────────────────────────┘
```

### RFID Scan Flow

```
1. Card tapped on ESP32
2. ESP32 encrypts { member, exp } with server's RSA public key
3. Publishes { device, ct } to  acs/access  over TLS
4. Backend decrypts with server private key
5. Looks up device → tenant → card → validates
6. Encrypts response with device's RSA public key
7. Publishes { ct } to  acs/response/{deviceId}
8. ESP32 decrypts with device private key → unlocks door / denies
```

### Database Schema

- **`system.*`** — global tables: `tenants`, `users`, `roles`, `devices`, `cards`, `access_logs`, `settings`
- **`tenant_{id}.*`** — per-tenant tables: `my_devices`, `my_cards`, `my_customers`, `membership_plans`, `customer_subscriptions`, `customer_invoices`

---

## 3. Requirements & Prerequisites

### Server / VPS
- Ubuntu 22.04+ (or any Debian-based Linux)
- Minimum 2 vCPU, 2GB RAM, 20GB disk
- A domain name with DNS A records pointing to the server (e.g. `api.your-domain.com`, `app.your-domain.com`, `mqtt.your-domain.com`)
- Ports open: `80`, `443`, `3000`, `5001`, `8883`

### Local Development Machine
- Node.js 20+
- PostgreSQL 15+
- Git

### Arduino (ESP32 Firmware)
Install these libraries via Arduino IDE → Library Manager:
- `WiFiManager` by tzapu
- `PubSubClient` by Nick O'Leary
- `ArduinoJson` by Benoit Blanchon
- `MFRC522` by GithubCommunity

ESP32 board support: Arduino IDE → Boards Manager → search `esp32` → install Espressif Systems.

---

## 4. Local Development Setup

### 4.1 Clone the repository

```bash
git clone <repo-url>
cd access-control-project
```

### 4.2 PostgreSQL — create the database

```bash
psql -U postgres
CREATE DATABASE access_control;
\q
```

### 4.3 Backend — install and configure

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
DATABASE_URL=postgresql://<user>@localhost:5432/access_control
JWT_SECRET=<random 32+ char string>
JWT_REFRESH_SECRET=<random 32+ char string>
PORT=5001
NODE_ENV=development
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=acs-backend
MQTT_PASSWORD=<your broker backend password>
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
SERVER_RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

> **Generate the server RSA key pair** (one-time):
> ```bash
> openssl genrsa -out server_private.pem 2048
> openssl rsa -in server_private.pem -pubout -out server_public.pem
> cat server_private.pem   # paste into SERVER_RSA_PRIVATE_KEY (replace newlines with \n)
> cat server_public.pem    # paste into NeyoFit_Access.ino → SERVER_PUBLIC_KEY
> ```

Run database migrations:

```bash
npx ts-node src/scripts/migrate-system.ts
npx ts-node src/scripts/migrate-tenants.ts
npx ts-node src/scripts/migrate-device-pubkey.ts
```

Seed initial data (SYSTEM user, default roles):

```bash
npx ts-node src/scripts/seed.ts
```

Start the backend:

```bash
npm run dev
# Running on http://localhost:5001
```

### 4.4 Frontend — install and configure

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random 32+ char string>
NEXT_PUBLIC_API_URL=http://localhost:5001/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5001
BACKEND_URL=http://localhost:5001
```

Start the frontend:

```bash
npm run dev
# Running on http://localhost:3000
```

### 4.5 Local MQTT Broker (optional for local dev)

Install Mosquitto locally:

```bash
# macOS
brew install mosquitto

# Ubuntu
sudo apt install mosquitto mosquitto-clients
```

Start with no authentication for local testing:

```bash
mosquitto -p 1883
```

### 4.6 Valkey / Redis (for BullMQ)

```bash
# macOS
brew install valkey && valkey-server

# Ubuntu
sudo apt install valkey && valkey-server
```

---

## 5. Production Deployment (Clean Server)

### 5.1 Initial server setup

SSH into your server and run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add your user to docker group (avoids sudo on every command)
sudo usermod -aG docker $USER
newgrp docker
```

### 5.2 Pull base images (one-time)

```bash
docker pull node:latest
docker pull valkey/valkey:latest
```

These are reused across all future projects and rebuilds. Never need to pull again unless you want to update them.

### 5.3 Create the shared Docker network

All containers communicate over this network:

```bash
docker network create acs-net
```

### 5.4 Install PostgreSQL on the host

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql && sudo systemctl start postgresql

# Create database and user
sudo -u postgres psql
CREATE USER acs WITH PASSWORD '<strong password>';
CREATE DATABASE access_control OWNER acs;
\q
```

**Identify which Postgres cluster is on port 5432.** A server can have multiple clusters installed (e.g. 16 and 18). The Docker backend will dial port 5432 — make sure you edit *that* cluster's config files, not a different version's.

```bash
pg_lsclusters
# Look for the cluster on Port 5432. The number under "Ver" is what you use below
# in place of <ver> (e.g. 16, 18).
```

Allow Docker containers to reach host PostgreSQL:

```bash
sudo nano /etc/postgresql/<ver>/main/postgresql.conf
# Find the listen_addresses line (commented by default) and set it to:
#   listen_addresses = 'localhost,172.17.0.1'
# This binds Postgres to localhost (existing host apps unaffected) AND the
# Docker bridge interface only — the public NIC is never bound, so a misconfigured
# firewall can't accidentally expose your DB.

sudo nano /etc/postgresql/<ver>/main/pg_hba.conf
# Add this line at the bottom (above any reject rules):
#   host  access_control  acs  172.16.0.0/12  scram-sha-256
# The /12 subnet covers 172.16.x through 172.31.x, which spans both the default
# bridge AND any custom Docker networks (such as acs-net which uses 172.20.x).

# listen_addresses changes need a full RESTART, not just a reload.
sudo systemctl restart postgresql@<ver>-main

# Verify
ss -ltn | grep 5432
# Expect TWO lines: 127.0.0.1:5432 AND 172.17.0.1:5432
sudo -u postgres psql -c "SHOW listen_addresses;"
# Expect: localhost,172.17.0.1
```

> **Why not `listen_addresses = '*'`?** It works, but binds Postgres to the public NIC too — one firewall slip and the DB is on the internet. The localhost+docker0 form physically cannot accept public connections regardless of firewall state. Auth via `pg_hba.conf` is unchanged either way.

> **Why scope the `pg_hba` line to a specific DB and user?** Other apps using this Postgres instance keep working untouched. Only the `acs` user can authenticate against the `access_control` database from a Docker subnet — nothing else changes.

### 5.5 TLS certificate for MQTT broker

The MQTT broker MUST have a valid Let's Encrypt cert before `acs-mqtt` can start. The container will crash-loop on every restart until the cert exists at `/etc/letsencrypt/live/<MQTT_DOMAIN>/`.

**Pre-flight:** confirm DNS for the MQTT domain points at this server's public IPv4:

```bash
dig +short mqtt.your-domain.com
curl -s -4 ifconfig.me
# Both must match.
```

Issue the cert (standalone needs port 80 free during the ACME challenge):

```bash
sudo apt install -y certbot

# If anything is on port 80 (e.g. nginx), stop it briefly first
sudo systemctl stop nginx 2>/dev/null

sudo certbot certonly --standalone -d mqtt.your-domain.com \
  --non-interactive --agree-tos -m <your-email>

sudo systemctl start nginx 2>/dev/null

# Verify
ls -lL /etc/letsencrypt/live/mqtt.your-domain.com/fullchain.pem \
        /etc/letsencrypt/live/mqtt.your-domain.com/privkey.pem
```

**Set up the renewal deploy hook** so Mosquitto picks up renewed certs automatically. Without this, the broker silently serves an expired cert ~90 days later because Mosquitto only reads cert files on process start:

```bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
sudo tee /etc/letsencrypt/renewal-hooks/deploy/restart-acs-mqtt.sh > /dev/null <<'EOF'
#!/bin/sh
case "$RENEWED_DOMAINS" in
  *mqtt.your-domain.com*) docker restart acs-mqtt 2>/dev/null || true ;;
esac
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/restart-acs-mqtt.sh
```

Replace `mqtt.your-domain.com` in the hook script with your actual MQTT domain.

### 5.6 Clone the repository

```bash
cd /home/$USER
git clone <repo-url>
cd access-control-project
```

### 5.7 Configure environment files

**Root `.env`** (docker-compose variable substitution):

```bash
cat > .env << 'EOF'
MQTT_DOMAIN=mqtt.your-domain.com
EOF
```

**`backend/.env`**:

```bash
cat > backend/.env << 'EOF'
DATABASE_URL=postgresql://acs:<password>@host.docker.internal:5432/access_control
JWT_SECRET=<random 64 char string>
JWT_REFRESH_SECRET=<random 64 char string>
PORT=5001
NODE_ENV=production
MQTT_BROKER_URL=mqtt://acs-mqtt:1883
MQTT_USERNAME=acs-backend
MQTT_PASSWORD=<backend mqtt password>
REDIS_HOST=acs-valkey
REDIS_PORT=6379
SERVER_RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
EOF
```

> **About `host.docker.internal`:** On Linux, this hostname does not resolve by default — the `backend` service in `docker-compose.yml` already has `extra_hosts: ["host.docker.internal:host-gateway"]` baked in to make it work. From inside the container, `127.0.0.1` is the *container's* loopback (nothing on 5432) — only `host.docker.internal` reaches the host. Always use it in `DATABASE_URL` when Postgres runs on the host.

**`frontend/.env`**:

```bash
cat > frontend/.env << 'EOF'
NEXTAUTH_URL=https://app.your-domain.com
NEXTAUTH_SECRET=<random 64 char string>
NEXT_PUBLIC_API_URL=https://api.your-domain.com/api
NEXT_PUBLIC_SOCKET_URL=https://api.your-domain.com
BACKEND_URL=http://acs-backend:5001
EOF
```

> **`BACKEND_URL` vs `NEXT_PUBLIC_API_URL`** — these point at the same backend but are used in different places. `NEXT_PUBLIC_*` values ship to the browser and must be the public hostname. `BACKEND_URL` is read only by NextAuth's `authorize()` callback, which runs *inside* the frontend container — that fetch goes container-to-container over `acs-net`, so it uses the Docker service name (`acs-backend`), not the public URL. If `BACKEND_URL` is unset, the NextAuth route defaults to `http://localhost:4000` and every login returns "Invalid credentials" with no log line on the backend (because the request never reaches it).

**`mosquitto/.env`**:

```bash
cat > mosquitto/.env << 'EOF'
MQTT_DOMAIN=mqtt.your-domain.com
MQTT_BACKEND_USER=acs-backend
MQTT_BACKEND_PASSWORD=<backend mqtt password>
MQTT_DEVICE_USER=acs-device
MQTT_DEVICE_PASSWORD=<device mqtt password>
EOF
```

> `MQTT_BACKEND_PASSWORD` must match `MQTT_PASSWORD` in `backend/.env`.
> `MQTT_DEVICE_PASSWORD` must match `MQTT_PASS` in `NeyoFit_Access.ino`.

### 5.8 Run database migrations

PostgreSQL runs on the host (not in Docker), so `psql` is invoked directly on the server.

```bash
cd backend
npm install

# 1. Apply the initial SQL schema (creates the `system` schema + base tables).
#    Required on a fresh database — the ts-node scripts below only ALTER existing tables.
set -a && source .env && set +a
psql "$DATABASE_URL" -f migrations/001_InitialSchema.sql

# 2. Apply incremental migrations and seed data.
npx ts-node src/scripts/migrate-system.ts
npx ts-node src/scripts/migrate-tenants.ts
npx ts-node src/scripts/migrate-device-pubkey.ts
npx ts-node src/scripts/seed.ts
cd ..
```

> `001_InitialSchema.sql` uses `IF NOT EXISTS` everywhere, so it's safe to re-run.
> `002_TenantSchemaTemplate.sql` is **not** applied here — it's invoked dynamically by `TenantSchemaService.provision()` each time a new tenant is created.

### 5.9 Build and start all containers

```bash
bash rebuild-access-control-system.sh
```

This will:
1. Stop and remove existing containers
2. Rebuild all images from source (no cache)
3. Start in order: `acs-valkey` → `acs-mqtt` → `acs-backend` → `acs-frontend`

Verify everything is running:

```bash
docker compose ps
docker compose logs -f
```

### 5.10 Reverse proxy with Nginx (recommended)

```bash
sudo apt install -y nginx

sudo nano /etc/nginx/sites-available/access-control
```

```nginx
# API + WebSocket
server {
    listen 80;
    server_name api.your-domain.com;
    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}

# Frontend
server {
    listen 80;
    server_name app.your-domain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/access-control /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Add HTTPS
sudo certbot --nginx -d api.your-domain.com -d app.your-domain.com
```

### 5.11 Register ESP32 devices

After deployment, for each physical device:

1. Flash `NeyoFit_Access.ino` to the ESP32
2. On first boot, blue LED turns on (~30 seconds) — device generates its RSA key pair
3. Connect the device to WiFi via the captive portal (`ACS-XXXX` AP)
4. Open `http://<device-ip>/` in a browser
5. Under **Crypto / Registration** → click **Show & copy to admin panel**
6. In the system dashboard → **Devices** → **Edit** the device → paste the public key → Save
7. The device is now fully registered and will process encrypted card scans

---

## 6. Production Troubleshooting

Real issues encountered during the first production deploy and exactly how each was diagnosed and fixed. If you hit one of these, don't guess — match the error string and follow the fix.

### 6.1 `acs-backend` crash-loop: `Cannot find module 'module-alias/register'`

**Symptom:** `docker logs acs-backend` shows Node failing at preload before app code runs.

**Cause:** old Dockerfile `CMD` had `node -r module-alias/register` left over from a template, but the package isn't in `package.json` and the codebase doesn't use path aliases.

**Fix:** already applied in `backend/Dockerfile` (`CMD ["node", "dist/app.js"]`) and `backend/package.json` `start` script. If the error returns, ensure those two files don't reintroduce the `-r module-alias/register` flag.

### 6.2 `acs-mqtt` crash-loop: `Unable to open pwfile` / `Unable to open log file`

**Symptom:** Mosquitto starts, errors immediately on `/mosquitto/config/passwd` or `/mosquitto/log/mosquitto.log`.

**Cause:** Mosquitto's Debian package drops privileges to the `mosquitto` user (UID 1883) at startup. The entrypoint creates files as root with `chmod 0600`; the bind-mounted log/data dirs are root-owned on the host. The `mosquitto` user can't read or write them.

**Fix:** `mosquitto/config/mosquitto.conf` includes `user root` so the broker stays as root inside the container (single-process container, no privilege boundary to defend). If you delete that line, the issue returns.

### 6.3 `acs-mqtt` crash-loop: `Unable to load server certificate "/mosquitto/certs/fullchain.pem"`

**Symptom:** Broker starts, then errors on the cert file — but the host's Let's Encrypt dir exists.

**Cause:** Let's Encrypt stores real certs under `/etc/letsencrypt/archive/<domain>/` and exposes symlinks under `/etc/letsencrypt/live/<domain>/`. If you only bind-mount `live/<domain>` into the container, the symlinks point at `../../archive/...` — paths that don't exist inside the container.

**Fix:** `docker-compose.yml` bind-mounts the *whole* `/etc/letsencrypt` tree, and `mosquitto/entrypoint.sh` does `cp -L` (dereferences symlinks) into `/mosquitto/certs/` at startup. Don't change either back to a narrower mount.

### 6.4 `acs-mqtt` errors: `Certs not found at /etc/letsencrypt/live/<domain>`

**Symptom:** entrypoint logs `[MQTT] ERROR: Certs not found...` — clear message from our entrypoint validation.

**Cause:** certbot has not been run for that domain on this host.

**Fix:** issue the cert per Section 5.5, then `docker restart acs-mqtt`. No image rebuild needed — `/etc/letsencrypt` is bind-mounted live.

### 6.5 `acs-backend`: `connect ECONNREFUSED 127.0.0.1:5432`

**Symptom:** Backend cannot reach Postgres. Error address is `127.0.0.1:5432`.

**Cause:** `DATABASE_URL` in `backend/.env` is using `127.0.0.1` or `localhost`. From inside the container, that is the container's own loopback — not the host.

**Fix:** edit `backend/.env`:

```
DATABASE_URL=postgresql://acs:<password>@host.docker.internal:5432/access_control
```

Then `docker restart acs-backend`. See Section 5.7 for why `host.docker.internal` is required on Linux.

### 6.6 `acs-backend`: `connect ECONNREFUSED <host-ip>:5432` (from inside container)

**Symptom:** `DATABASE_URL` is correct (using `host.docker.internal`), but the connection still refuses.

**Cause:** Postgres on the host is bound to `127.0.0.1` only. From the host's perspective, the docker-bridge IP is a different interface that Postgres isn't listening on.

**Diagnose:**

```bash
ss -ltn | grep 5432
# Bad:  only 127.0.0.1:5432 ::1:5432
# Good: also includes 172.17.0.1:5432
```

**Fix:** Section 5.4 — set `listen_addresses = 'localhost,172.17.0.1'` and **restart** (not reload) the cluster.

> **Reload vs restart trap:** `listen_addresses` is one of the few Postgres settings that requires a full restart. `systemctl reload postgresql` will silently accept the change without re-binding the listener. Always `systemctl restart postgresql@<ver>-main`.

> **Wrong cluster trap:** `systemctl restart postgresql` (no `@<ver>-main`) is a wrapper that may not actually restart the cluster. If `pg_settings.sourcefile` is empty or shows a different version's path than the file you edited, you edited the wrong cluster's config. Run `pg_lsclusters` to identify which version is on port 5432.

### 6.7 `acs-backend`: `no pg_hba.conf entry for host "172.20.0.X"`

**Symptom:** Connection reaches Postgres, but auth is denied with the container's actual source IP listed.

**Cause:** Custom Docker networks (e.g. `acs-net`) use subnets like `172.20.x.x` or `172.21.x.x` — outside the default-bridge `172.17.0.0/16` range. A narrow `pg_hba` rule for `/16` won't match.

**Fix:** the rule in Section 5.4 uses `172.16.0.0/12`, which spans `172.16.x` through `172.31.x` and covers all standard Docker subnets. After editing `pg_hba.conf`:

```bash
sudo systemctl reload postgresql@<ver>-main   # reload IS enough for pg_hba changes
sudo -u postgres psql -c "SELECT type, database, user_name, address, netmask, error FROM pg_hba_file_rules WHERE 'access_control' = ANY(database);"
# error column should be NULL; netmask for /12 is 255.240.0.0
```

Also confirm the rule starts with `host` (not `hostssl`) — the latter only matches SSL-encrypted connections, but the backend's pg client connects without SSL by default.

### 6.8 `acs-backend`: `getaddrinfo EAI_AGAIN acs-mqtt`

**Symptom:** Backend can't resolve the `acs-mqtt` hostname.

**Cause:** `acs-mqtt` is restarting (so it never registers DNS on the bridge). Almost always a downstream symptom of one of 6.2–6.4 above.

**Fix:** `docker ps` — if `acs-mqtt` is `Restarting`, look at its logs and follow the corresponding section. Once mqtt is `Up`, the backend's reconnect loop picks it up automatically.

### 6.9 docker-compose: `services.extra_hosts must be a mapping`

**Symptom:** `bash rebuild-access-control-system.sh` fails immediately during build.

**Cause:** YAML indentation — `extra_hosts:` is at the level of `services:` instead of nested inside a service.

**Fix:** `extra_hosts:` must be indented at the same level as `image:`, `networks:`, etc. *inside* the `backend:` service. Validate with `docker compose config >/dev/null && echo OK` before rebuilding.

### 6.10 Stale image after entrypoint or Dockerfile changes

**Symptom:** You changed `mosquitto/entrypoint.sh` (or another in-image file), but the container still behaves like the old version — the new log lines never appear.

**Cause:** Build cache reused the `COPY entrypoint.sh` layer.

**Fix:**

```bash
docker stop acs-mqtt && docker rm acs-mqtt
docker rmi acs-mqtt:latest
docker compose build --no-cache mosquitto
docker compose up -d mosquitto
```

The `rebuild-access-control-system.sh` script already passes `--no-cache`, but if you've been doing manual `docker compose up` between edits, that may not have applied.

---

## Useful Commands

```bash
# Rebuild a single service only
bash rebuild-access-control-system.sh backend

# View live logs
docker compose logs -f backend
docker compose logs -f mosquitto

# Restart a service
docker compose restart backend

# Open a shell inside a container
docker exec -it acs-backend sh

# Monitor MQTT messages live (from inside the server)
docker exec -it acs-mqtt mosquitto_sub -t 'acs/#' -v -u acs-backend -P <password>
```

docker exec -it acs-backend sh -c 'apk add --no-cache postgresql-client >/dev/null 2>&1; psql "$DATABASE_URL" -c "SELECT email, substring(password_hash, 1, 15) AS h FROM system.users WHERE email='\''admin@neyofit.io'\'';"'