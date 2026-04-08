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

Allow Docker containers to reach host PostgreSQL:

```bash
sudo nano /etc/postgresql/*/main/postgresql.conf
# Set: listen_addresses = '*'

sudo nano /etc/postgresql/*/main/pg_hba.conf
# Add this line at the bottom:
# host  access_control  acs  172.17.0.0/16  md5

sudo systemctl restart postgresql
```

### 5.5 TLS certificate for MQTT broker

```bash
sudo apt install -y certbot

# Replace with your actual MQTT domain
sudo certbot certonly --standalone -d mqtt.your-domain.com

# Certificates will be at: /etc/letsencrypt/live/mqtt.your-domain.com/
```

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

> **Note:** On Linux, `host.docker.internal` may not resolve automatically. If the backend cannot connect to PostgreSQL, add this to the `backend` service in `docker-compose.yml`:
> ```yaml
> extra_hosts:
>   - "host.docker.internal:host-gateway"
> ```

**`frontend/.env`**:

```bash
cat > frontend/.env << 'EOF'
NEXTAUTH_URL=https://app.your-domain.com
NEXTAUTH_SECRET=<random 64 char string>
NEXT_PUBLIC_API_URL=https://api.your-domain.com/api
NEXT_PUBLIC_SOCKET_URL=https://api.your-domain.com
EOF
```

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

```bash
cd backend
npm install
npx ts-node src/scripts/migrate-system.ts
npx ts-node src/scripts/migrate-tenants.ts
npx ts-node src/scripts/migrate-device-pubkey.ts
npx ts-node src/scripts/seed.ts
cd ..
```

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
