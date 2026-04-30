# Nginx Reverse Proxy Setup

Production reverse-proxy configuration for the Access Control System. Covers `app.<domain>` (frontend) and `api.<domain>` (backend + Socket.io). Explains why MQTT is **not** proxied through nginx by default, and provides an optional stream-proxy variant for those who want unified TLS management.

Assumes nginx is already installed and serving other sites on this host.

---

## What goes through nginx

| Domain | Backend service | Why nginx |
|---|---|---|
| `app.<domain>` | `acs-frontend` on `:3000` | TLS termination, HTTP→HTTPS redirect, host-based routing |
| `api.<domain>` | `acs-backend` on `:5001` | TLS termination, WebSocket upgrade for Socket.io |
| `mqtt.<domain>` | `acs-mqtt` on `:8883` | **Not proxied.** See Section 5. |

---

## 1. Prerequisites

```bash
# Confirm nginx is installed and running
nginx -v
sudo systemctl status nginx --no-pager | head -5

# Confirm certbot's nginx plugin is installed (needed for --nginx flag)
which certbot
dpkg -l | grep python3-certbot-nginx || sudo apt install -y python3-certbot-nginx
```

DNS A records (all pointing at this server's public IPv4):

```bash
dig +short app.<your-domain>
dig +short api.<your-domain>
dig +short mqtt.<your-domain>      # already set up — used by the broker directly
curl -s -4 ifconfig.me             # all three should match this
```

Firewall — ports `80`, `443`, and `8883` open inbound. (`80` is required for ACME HTTP-01 cert renewals.)

---

## 2. Two-phase setup — why HTTP-only first

`certbot --nginx` cannot run if nginx is broken, and nginx is broken if a config references `ssl_certificate` files that don't exist yet. So we deploy the site configs as **HTTP-only** first, run certbot, and let the `--nginx` plugin **add** the `listen 443 ssl` block + `ssl_certificate` lines automatically.

Do **not** put `listen 443 ssl` blocks in the initial config — `nginx -t` will reject them with:

```
no "ssl_certificate" is defined for the "listen ... ssl" directive
```

After certbot runs, the same files will contain both the HTTP (now redirected to HTTPS) and HTTPS server blocks. You don't have to write the `443` block by hand.

---

## 3. Frontend — `app.<your-domain>`

Create the HTTP-only site config:

```bash
sudo nano /etc/nginx/sites-available/acs-app
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name app.<your-domain>;

    client_max_body_size 10M;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Next.js HMR (dev only — harmless in prod)
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";

        proxy_read_timeout 60s;
    }
}
```

---

## 4. Backend API + Socket.io — `api.<your-domain>`

```bash
sudo nano /etc/nginx/sites-available/acs-api
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name api.<your-domain>;

    # Backend handles file uploads (cards bulk-import, etc.) — bump if needed.
    client_max_body_size 25M;

    # Long-lived Socket.io connections — don't kill them at 60s default.
    proxy_read_timeout  300s;
    proxy_send_timeout  300s;

    # REST API
    location /api/ {
        proxy_pass         http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Socket.io — needs WebSocket upgrade + sticky proxy_pass
    location /socket.io/ {
        proxy_pass         http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
    }

    # Catch-all for any other backend routes
    location / {
        proxy_pass         http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

---

## 5. Enable, start nginx, and obtain HTTPS

```bash
# Enable
sudo ln -sf /etc/nginx/sites-available/acs-app /etc/nginx/sites-enabled/acs-app
sudo ln -sf /etc/nginx/sites-available/acs-api /etc/nginx/sites-enabled/acs-api

# Validate config
sudo nginx -t
# Expect: "syntax is ok" + "test is successful"
# (Pre-existing warnings about other sites are harmless — see Section 8.)

# Make sure nginx is actually running. If you stopped it earlier (e.g. for the
# `certbot --standalone` call when issuing the mqtt cert), it may be inactive.
sudo systemctl status nginx --no-pager | head -5
sudo systemctl start nginx     # no-op if already running
```

Issue + install certs in one shot. The `--nginx` plugin **edits each site file in place** to add a new `server { listen 443 ssl ... }` block with `ssl_certificate` directives, and rewrites the existing `listen 80` block into a 301 redirect to HTTPS:

```bash
sudo certbot --nginx \
  -d app.<your-domain> \
  -d api.<your-domain> \
  --non-interactive --agree-tos -m <your-email> --redirect
```

What changes in `/etc/nginx/sites-available/acs-app` after certbot runs:

- Original `server { listen 80; ... }` block is rewritten to `return 301 https://$host$request_uri;`
- A new `server { listen 443 ssl; ... }` block is appended with `ssl_certificate` + `ssl_certificate_key` lines and your original `proxy_pass` config copied into it.

Same for `acs-api`. `certbot --nginx` reloads nginx itself — no manual reload needed.

Verify:

```bash
curl -sI https://app.<your-domain> | head -5
curl -sI https://api.<your-domain>/api/health 2>/dev/null | head -5
sudo certbot certificates | grep -E "Domain|Expiry"
```

---

## 6. Why MQTT is NOT proxied through nginx

The MQTT broker `acs-mqtt` already terminates its own TLS on port `8883` using the Let's Encrypt cert at `/etc/letsencrypt/live/mqtt.<your-domain>/`. Putting nginx in front of it would mean:

- Adding the `stream` module config (separate from `http {}` block — easy to misconfigure)
- Re-terminating TLS at nginx, opening plain TCP to Mosquitto (small attack surface increase)
- An extra hop for every MQTT packet — measurable latency on RFID-scan flows
- Splitting cert ownership between certbot's deploy hook (which restarts `acs-mqtt`) and nginx's reload (which doesn't know about the broker)

The only real argument for nginx-fronting MQTT is unified cert/log management. Skip it unless you have that exact need.

The current setup:

```
ESP32 ─── TLS over 8883 ───▶ Mosquitto (acs-mqtt)
                              ↑
              certbot writes cert to /etc/letsencrypt/live/mqtt.<domain>/
              renewal hook restarts acs-mqtt to reload it
```

Already configured in `mosquitto/config/mosquitto.conf` and `/etc/letsencrypt/renewal-hooks/deploy/restart-acs-mqtt.sh` (see main `README.md` Section 5.5).

### 6.1 Optional — nginx stream proxy for MQTT (advanced)

If you do want nginx in front, configure it as a TCP stream proxy (NOT an HTTP reverse proxy — MQTT isn't HTTP).

**Step 1.** Install the stream module:

```bash
sudo apt install -y libnginx-mod-stream
```

**Step 2.** Stop publishing port 8883 from the container — only `127.0.0.1` should reach Mosquitto. In `docker-compose.yml`, change the mosquitto service ports:

```yaml
ports:
  - "127.0.0.1:8883:8883"
```

(or expose only port 1883 internally and have nginx terminate TLS — see step 4 below for that variant)

**Step 3.** Create `/etc/nginx/conf.d/mqtt-stream.conf` (top-level, NOT in `sites-enabled/`):

```nginx
# This block goes at the top level of nginx.conf, not inside http{}.
# /etc/nginx/conf.d/*.conf is included at the top level on Debian/Ubuntu.
stream {
    upstream mqtt_backend {
        server 127.0.0.1:8883;
    }

    server {
        listen 8883 ssl;
        listen [::]:8883 ssl;

        ssl_certificate     /etc/letsencrypt/live/mqtt.<your-domain>/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/mqtt.<your-domain>/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;

        proxy_pass mqtt_backend;
        proxy_connect_timeout 5s;
    }
}
```

**Step 4 (variant — terminate TLS at nginx, plain TCP to Mosquitto):**
- In `mosquitto.conf`, drop the `listener 8883` and the `certfile`/`keyfile` lines — keep only `listener 1883`.
- In `docker-compose.yml`, change the port mapping to `"127.0.0.1:1883:1883"`.
- In the nginx stream block above, change `server 127.0.0.1:8883;` to `server 127.0.0.1:1883;`.
- Update the renewal hook to reload nginx instead of restarting `acs-mqtt`:
  ```sh
  case "$RENEWED_DOMAINS" in
    *mqtt.<your-domain>*) systemctl reload nginx 2>/dev/null || true ;;
  esac
  ```

**Step 5.** Validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

**Verify the TLS handshake works through nginx:**

```bash
openssl s_client -connect mqtt.<your-domain>:8883 -servername mqtt.<your-domain> </dev/null 2>/dev/null | grep -E "subject=|Verify return"
```

---

## 7. Verification checklist

After cert issuance and reload:

```bash
# All four containers up
docker ps --filter "name=acs-" --format "table {{.Names}}\t{{.Status}}"

# Frontend reachable through nginx with valid cert
curl -sI https://app.<your-domain> | head -5
# Expect: HTTP/2 200 (or HTTP/2 307 to /login)

# API reachable + Socket.io upgrade works
curl -sI https://api.<your-domain>/api/health | head -5
curl -sI -H "Upgrade: websocket" -H "Connection: Upgrade" \
     https://api.<your-domain>/socket.io/?EIO=4 | head -5

# MQTT TLS handshake direct to Mosquitto
openssl s_client -connect mqtt.<your-domain>:8883 -servername mqtt.<your-domain> </dev/null 2>/dev/null | grep "Verify return"
# Expect: Verify return code: 0 (ok)

# Cert auto-renewal dry run (does not actually renew, just checks the path works)
sudo certbot renew --dry-run
```

---

## 8. Common gotchas

### 8.1 `[emerg] no "ssl_certificate" is defined for the "listen ... ssl" directive`

**Symptom:** `nginx -t` rejects the new site, `certbot --nginx` then fails with `MisconfigurationError`. You're stuck — nginx won't start because the cert is missing, and you can't get a cert because nginx won't start.

**Cause:** the site config includes a `listen 443 ssl` block referencing cert files that don't exist yet.

**Fix:** the configs in this guide are HTTP-only on purpose (see Section 2). Don't add `listen 443 ssl` blocks before running certbot — `certbot --nginx` injects that block itself once the cert exists. If you accidentally added one, remove it, run `nginx -t` until clean, then run certbot.

### 8.2 `nginx.service is not active, cannot reload`

**Symptom:** `systemctl reload nginx` errors with the above. Often happens after issuing the MQTT cert via `certbot --standalone`, which requires you to stop nginx briefly.

**Fix:** `sudo systemctl start nginx`. Confirm with `systemctl status nginx --no-pager | head -5`. After this, future config changes use `reload`, not `start`.

### 8.3 `nginx: [emerg] could not build server_names_hash`

Server name too long or too many. Increase the hash bucket size in `/etc/nginx/nginx.conf`:

```nginx
http {
    server_names_hash_bucket_size 128;
    ...
}
```

### 8.4 Socket.io disconnects every 60 seconds

You forgot the `proxy_read_timeout` bump on the API server block. Socket.io ping/pong won't keep the upstream connection alive past nginx's default 60s read timeout. Set it to at least `300s` as shown in Section 4.

### 8.5 `502 Bad Gateway` immediately after reload

Container isn't bound to the host port nginx expects. Confirm:

```bash
ss -ltn | grep -E ":(3000|5001) "
# Expect: 0.0.0.0:3000 and 0.0.0.0:5001 (or 127.0.0.1:* if you tightened compose ports)
```

If you tightened the compose port maps to `127.0.0.1:3000:3000`, nginx still works because it proxies via `127.0.0.1`. If you tightened to `<docker-network-only>`, nginx can't reach it — revert.

### 8.6 Certbot fails with `Connection refused` on port 80

Something else is bound to `:80` and not serving the `.well-known/acme-challenge/` path. Stop the conflicting service or add the location block to its config. With `--nginx`, certbot temporarily edits your nginx config to serve the challenge — make sure the HTTP `server {}` block from Section 3/4 is enabled before running certbot.

### 8.7 Pre-existing `nginx -t` warnings about other sites

Outputs like:

```
[warn] protocol options redefined for 0.0.0.0:443 in /etc/nginx/sites-enabled/<other>:N
[warn] "ssl_stapling" ignored, no OCSP responder URL in the certificate ...
```

These are warnings, not errors, and they refer to **other unrelated sites** on this server. Don't try to "fix" them as part of this guide — they were there before you added ACS sites and didn't break anything. Only act if `nginx -t` ends with `test failed`.

### 8.8 HTTPS works but app/api can't reach Postgres after switching schemes

Unrelated to nginx — confirm `backend/.env` `DATABASE_URL` still uses `host.docker.internal` (see main `README.md` Section 6.5). Reverse proxy doesn't change container networking.

### 8.9 `acs-mqtt` works on 1883 internally but ESP32s can't connect on 8883

If you went with the optional Section 6.1 stream-proxy setup and changed Mosquitto to listen only on `1883`, ESP32 firmware still expects TLS on `8883`. The nginx stream block must be the thing answering on `8883`, not Mosquitto. `ss -ltn | grep 8883` should show nginx, not docker-proxy.

---

## 9. File summary

After following this guide:

| File | Owner | Purpose |
|---|---|---|
| `/etc/nginx/sites-available/acs-app` | manual | Frontend reverse proxy + TLS |
| `/etc/nginx/sites-available/acs-api` | manual | Backend + Socket.io reverse proxy + TLS |
| `/etc/nginx/sites-enabled/acs-app` | symlink | Activate frontend site |
| `/etc/nginx/sites-enabled/acs-api` | symlink | Activate backend site |
| `/etc/letsencrypt/live/app.<domain>/` | certbot | TLS cert (90-day, auto-renews) |
| `/etc/letsencrypt/live/api.<domain>/` | certbot | TLS cert (90-day, auto-renews) |
| `/etc/letsencrypt/live/mqtt.<domain>/` | certbot | TLS cert for Mosquitto (Section 6) |
| `/etc/letsencrypt/renewal-hooks/deploy/restart-acs-mqtt.sh` | manual | Reloads `acs-mqtt` after Let's Encrypt renewal |
| `/etc/nginx/conf.d/mqtt-stream.conf` | manual, **optional** | Only if you chose Section 6.1 |

Cert renewals run automatically via certbot's systemd timer; the deploy hook handles the Mosquitto-side reload. Nginx renewals are picked up automatically since `--nginx` registers itself for reload on renewal.
