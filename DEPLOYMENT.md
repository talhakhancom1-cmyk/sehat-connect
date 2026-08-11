# EcoHealth — Deployment Guide

This document covers the full deployment process for EcoHealth, from
first-time server setup to routine updates and secret rotation.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [First-Time Server Setup](#3-first-time-server-setup)
4. [Routine Deployment](#4-routine-deployment)
5. [Environment Variables Reference](#5-environment-variables-reference)
6. [Secret Rotation](#6-secret-rotation)
7. [Verifying a Deployment](#7-verifying-a-deployment)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Architecture Overview

EcoHealth uses a **two-server split architecture**:

| Server | Role | Hosts | Example |
|--------|------|-------|---------|
| **App Server** | Main application | Frontend (Vite build), REST API, PostgreSQL, MinIO (new uploads) | `ehcserver.webfrat.com` |
| **Signaling Server** | Realtime + TURN | WebSocket signaling, TURN relay (coturn), MinIO (legacy uploads) | `afridiwins.online` |

### Why two servers?

- **Performance**: WebSocket connections and WebRTC media relay are
  CPU-intensive. Splitting them from the main API keeps the app server
  responsive for database queries and REST requests.
- **Scalability**: The signaling server can be scaled independently or
  replaced with a managed WebRTC service without touching the app server.
- **Resilience**: If the signaling server goes down, the app server
  continues serving the frontend, REST API, and database. Only real-time
  calls and chat are affected.

### How they communicate

The signaling server needs user data (DND status, caller identity) that
lives in the app server's database. Rather than exposing PostgreSQL
directly to the signaling server (a security risk), the app server
exposes an **internal API** at `/internal/` protected by a shared
secret (`INTERNAL_API_SECRET`), not user JWT auth.

```
Signaling Server --[x-internal-secret header]--> App Server /internal/users/:id
```

### Shared secrets (MUST be identical on both servers)

| Secret | Purpose |
|--------|---------|
| `JWT_SECRET` | Sign/verify auth tokens. App server issues; signaling server verifies. |
| `FILE_DOWNLOAD_SECRET` | Generate/verify file download tokens. |
| `INTERNAL_API_SECRET` | Protects `/internal/` endpoints for service-to-service calls. |

If any of these mismatch, WebSocket connections fail with "Invalid or
expired token", file downloads return 403, or internal API calls return 401.

---

## 2. Prerequisites

### For both servers

- **OS**: Ubuntu 22.04, 24.04, or 26.04 LTS
- **Architecture**: x86_64 (amd64)
- **RAM**: Minimum 2GB, recommended 4GB
- **Disk**: Minimum 20GB
- **Access**: Root SSH access (key-based recommended)
- **DNS**: A record pointing to the server's IP

### Node.js version

Node.js 22+ is recommended. The setup scripts install it automatically
via NodeSource. If installing manually:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
```

### PM2

PM2 is installed globally by the setup scripts. If installing manually:

```bash
npm install -g pm2
```

---

## 3. First-Time Server Setup

### Option A: Using the setup scripts (recommended)

#### Step 1: Set up the app server

SSH into the app server and run:

```bash
# Clone the repo (or upload the deploy scripts)
git clone https://github.com/talhakhancom1-cmyk/ecohealth.git /opt/ecohealth
cd /opt/ecohealth

# Run the setup script
sudo DOMAIN=yourdomain.com \
     ADMIN_EMAIL=admin@yourdomain.com \
     bash deploy/setup-app-server.sh
```

The script will:
- Install Node.js, PostgreSQL, Nginx, PM2, MinIO
- Create the database and user with a generated password
- Generate all required secrets (JWT, file download, internal API)
- Clone the repo, install dependencies, build the frontend
- Configure Nginx with `/api/`, `/internal/`, `/ws/`, `/health` blocks
- Set up PM2 as a systemd service (survives reboots)
- Obtain SSL via certbot
- Print a summary with all generated credentials

**Save the printed credentials.** You'll need them for the signaling server.

#### Step 2: Set up the signaling server

SSH into the signaling server and run:

```bash
git clone https://github.com/talhakhancom1-cmyk/ecohealth.git /opt/ecohealth
cd /opt/ecohealth

# Pass the shared secrets from the app server
sudo DOMAIN=signaling.example.com \
     APP_SERVER_DOMAIN=yourdomain.com \
     JWT_SECRET=<from_app_server> \
     FILE_DOWNLOAD_SECRET=<from_app_server> \
     INTERNAL_API_SECRET=<from_app_server> \
     bash deploy/setup-signaling-server.sh
```

The script will:
- Install Node.js, Nginx, PM2, coturn, MinIO
- Configure coturn (TURN relay) with generated credentials
- Clone the repo, install backend dependencies
- Configure Nginx with `/api/`, `/ws/`, `/health` blocks
- Set up PM2 as a systemd service
- Obtain SSL via certbot

#### Step 3: Update TURN credentials on the app server

After the signaling server is set up, update the app server's `.env`
with the TURN credentials printed by the signaling server setup:

```bash
# On the app server
sudo nano /opt/ecohealth/backend/.env
# Update:
#   ICE_TURN_URLS=turn:signaling.example.com:3478
#   ICE_TURN_USERNAME=<from_signaling_setup>
#   ICE_TURN_CREDENTIAL=<from_signaling_setup>

# Restart to pick up changes
sudo pm2 restart ecohealth-backend --update-env
```

#### Step 4: Verify

```bash
# On the app server
curl -s https://yourdomain.com/health

# On the signaling server
curl -s https://signaling.example.com/health

# Test internal API from signaling -> app
curl -s -H "x-internal-secret: <INTERNAL_API_SECRET>" \
     https://yourdomain.com/internal/users/<some-user-id>
```

### Option B: Manual setup

If you prefer to set up manually, use the env example files as a guide:

1. Copy `deploy/env.app-server.example` to `backend/.env` on the app server
2. Copy `deploy/env.signaling-server.example` to `backend/.env` on the signaling server
3. Fill in all `<...>` placeholders with real generated values
4. Ensure shared secrets (`JWT_SECRET`, `FILE_DOWNLOAD_SECRET`, `INTERNAL_API_SECRET`) are identical
5. Install dependencies: `npm install --production` (backend) + `npm install` (frontend)
6. Build frontend: `cd frontend && npm run build`
7. Start PM2: `pm2 start ecosystem.config.js && pm2 save`
8. Set up PM2 startup: `pm2 startup` (follow the printed instructions)
9. Configure Nginx (see the nginx config blocks in the setup scripts)
10. Obtain SSL: `sudo certbot --nginx -d yourdomain.com`

---

## 4. Routine Deployment

### App server

```bash
sudo bash /opt/ecohealth/deploy/deploy-app-server.sh
```

Or manually (the script does exactly this):

```bash
cd /opt/ecohealth
git pull origin main

# Install dependencies
cd backend && npm install --production && cd ..
npm install

# Build frontend
cd frontend && npm run build

# Restart backend via PM2 (NEVER use nohup or manual kill)
sudo pm2 restart ecohealth-backend --update-env

# Verify
sleep 4
curl -s https://yourdomain.com/health
```

### Signaling server

```bash
sudo bash /opt/ecohealth/deploy/deploy-signaling-server.sh
```

Or manually:

```bash
cd /opt/ecohealth
git pull origin main

cd backend && npm install --production

# Restart via PM2
sudo pm2 restart ecohealth-backend --update-env

# Verify
sleep 4
curl -s https://signaling.example.com/health
sudo systemctl status coturn
```

### Important deployment rules

- **Always use `sudo pm2`** — PM2 runs as root. Running `pm2` without
  `sudo` may show an empty process list (different PM2 user context).
- **Never use `nohup`, `kill`, or `fuser`** to manage the backend process.
  These bypass PM2 and cause port conflicts, orphan processes, and
  reboot failures.
- **Always use `--update-env`** when restarting PM2 so it picks up
  `.env` changes.
- **Always run a health check** after deploying.

---

## 5. Environment Variables Reference

### App Server (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Yes | Backend port (default: 3000) |
| `NODE_ENV` | Yes | Set to `production` |
| `DB_HOST` | Yes | PostgreSQL host (usually `localhost`) |
| `DB_PORT` | Yes | PostgreSQL port (usually `5432`) |
| `DB_NAME` | Yes | Database name (default: `ecohealth`) |
| `DB_USER` | Yes | Database user (default: `sehat`) |
| `DB_PASSWORD` | Yes | Database password |
| `JWT_SECRET` | Yes | JWT signing secret. **Must match signaling server.** |
| `FILE_DOWNLOAD_SECRET` | Yes | File download token secret. **Must match signaling server.** |
| `CORS_ORIGIN` | Yes | Comma-separated allowed origins |
| `ADMIN_EMAIL` | First boot | Initial admin email |
| `ADMIN_PASSWORD` | First boot | Initial admin password |
| `MINIO_ENDPOINT` | Yes | MinIO host (usually `localhost`) |
| `MINIO_PORT` | Yes | MinIO port (usually `9000`) |
| `MINIO_USE_SSL` | Yes | `false` for local MinIO |
| `MINIO_ACCESS_KEY` | Yes | MinIO access key |
| `MINIO_SECRET_KEY` | Yes | MinIO secret key |
| `MINIO_BUCKET` | Yes | MinIO bucket name (default: `ecohealth-uploads`) |
| `MINIO_PUBLIC_BASE_URL` | Yes | Public URL for file access |
| `INTERNAL_API_SECRET` | Yes | Internal API shared secret. **Must match signaling server.** |
| `INTERNAL_API_BASE` | No | Leave blank on app server |
| `ICE_STUN_URLS` | Yes | Comma-separated STUN server URLs |
| `ICE_TURN_URLS` | Yes | Comma-separated TURN server URLs |
| `ICE_TURN_USERNAME` | Yes | TURN username |
| `ICE_TURN_CREDENTIAL` | Yes | TURN credential |
| `CALL_RING_TIMEOUT_MS` | No | Ring timeout in ms (default: 30000) |
| `OPENAI_API_KEY` | No | OpenAI key for symptom checker (can also be set via admin panel) |

### Signaling Server (`backend/.env`)

Same as above, with these differences:

| Variable | Difference |
|----------|------------|
| `CORS_ORIGIN` | Include both server domains |
| `INTERNAL_API_BASE` | **Required** — set to `https://<APP_SERVER_DOMAIN>` |
| `DB_PASSWORD` | Separate password for this server's own database |

---

## 6. Secret Rotation

### Rotating the database password

```bash
# 1. Generate a new password
NEW_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)

# 2. Update PostgreSQL
sudo -u postgres psql -c "ALTER USER sehat WITH PASSWORD '$NEW_PASS';"

# 3. Update .env on this server
sudo sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$NEW_PASS/" /opt/ecohealth/backend/.env

# 4. Restart PM2 to pick up the new password
sudo pm2 restart ecohealth-backend --update-env

# 5. Verify health
sleep 4
curl -s https://yourdomain.com/health
```

The database password is **per-server** — each server has its own
PostgreSQL instance. No need to sync between servers.

### Rotating JWT_SECRET

**Critical**: JWT_SECRET must be identical on both servers. Rotating it
will invalidate all active user sessions (everyone will need to log in
again).

```bash
# 1. Generate a new secret
NEW_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")

# 2. Update .env on BOTH servers
# On the app server:
sudo sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$NEW_SECRET/" /opt/ecohealth/backend/.env
sudo pm2 restart ecohealth-backend --update-env

# On the signaling server:
sudo sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$NEW_SECRET/" /opt/ecohealth/backend/.env
sudo pm2 restart ecohealth-backend --update-env

# 3. Verify both health checks
curl -s https://yourdomain.com/health
curl -s https://signaling.example.com/health

# 4. Test WebSocket auth (log in on the frontend and open a chat/call)
```

### Rotating FILE_DOWNLOAD_SECRET

Same process as JWT_SECRET — update on **both** servers and restart.
File URLs generated with the old secret will stop working.

### Rotating INTERNAL_API_SECRET

Same process — update on **both** servers and restart. Test the
internal API after:

```bash
# From the signaling server
curl -s -H "x-internal-secret: $NEW_SECRET" \
     https://<APP_SERVER_DOMAIN>/internal/users/<some-user-id>
```

### Rotating TURN credentials

```bash
# 1. Generate new credential on the signaling server
NEW_TURN_PASS=$(openssl rand -base64 18 | tr -d '/+=' | head -c 24)

# 2. Update coturn config
sudo sed -i "s/^user=.*/user=sehat:$NEW_TURN_PASS/" /etc/turnserver.conf
sudo systemctl restart coturn

# 3. Update .env on BOTH servers
sudo sed -i "s/^ICE_TURN_CREDENTIAL=.*/ICE_TURN_CREDENTIAL=$NEW_TURN_PASS/" /opt/ecohealth/backend/.env
sudo pm2 restart ecohealth-backend --update-env
```

---

## 7. Verifying a Deployment

### Health check

```bash
# App server
curl -s https://yourdomain.com/health
# Expected: {"status":"ok","database":"connected",...}

# Signaling server
curl -s https://signaling.example.com/health
# Expected: {"status":"ok","database":"connected",...}
```

### PM2 status

```bash
sudo pm2 status
# Expected: ecohealth-backend is "online" with 0 restarts

sudo pm2 logs ecohealth-backend --lines 20 --nostream
# Look for: "Server running on port 3000" and "Database synchronized successfully"
```

### Internal API test

From the signaling server, test the internal API to the app server:

```bash
curl -s -H "x-internal-secret: <INTERNAL_API_SECRET>" \
     https://<APP_SERVER_DOMAIN>/internal/users/<some-user-id>
# Expected: JSON with user data (not 401 or 403)
```

### TURN server test

```bash
# Check coturn is running
sudo systemctl status coturn

# Check TURN port is listening
sudo ss -tuln | grep 3478

# Test from an external machine with turnutils
turnutils_stunclient <SIGNALING_SERVER_DOMAIN>
```

### Nginx

```bash
sudo nginx -t          # Test config
sudo systemctl status nginx
sudo tail -20 /var/log/nginx/ecohealth-error.log
```

### Log locations

| Log | Path |
|-----|------|
| PM2 stdout | `backend/logs/out.log` |
| PM2 stderr | `backend/logs/error.log` |
| PM2 (via pm2 logs) | `~/.pm2/logs/ecohealth-backend-out.log` |
| Nginx access | `/var/log/nginx/ecohealth-access.log` |
| Nginx error | `/var/log/nginx/ecohealth-error.log` |
| PostgreSQL | `/var/log/postgresql/postgresql-*.log` |
| coturn | `/var/log/turnserver.log` |

---

## 8. Troubleshooting

### "Port already in use" / EADDRINUSE on port 3000

**Symptom**: PM2 keeps restarting the backend, logs show `EADDRINUSE`.

**Cause**: Another process is holding port 3000. This usually happens
after someone manually started the backend with `nohup node server.js`
instead of using PM2.

**Fix**:

```bash
# 1. Find what's on port 3000
sudo ss -tlnp | grep 3000

# 2. If it's a rogue node process (NOT PM2), kill it by PID
sudo kill <PID>

# 3. If PM2 lost track of the process, delete and recreate it
sudo pm2 delete ecohealth-backend
cd /opt/ecohealth/backend
sudo pm2 start ecosystem.config.js
sudo pm2 save

# 4. Verify
sudo pm2 status
curl -s http://localhost:3000/health
```

**Never use** `fuser -k 3000/tcp` — it can kill the PM2 daemon itself,
not just the app process.

**Never use** `nohup node server.js &` — it bypasses PM2 and causes
this exact problem.

---

### PM2 process not found / empty process list

**Symptom**: `pm2 list` shows nothing, but the backend is running.

**Cause**: PM2 is running as root, but you're running `pm2` as a
non-root user. Each user has their own PM2 process list.

**Fix**:

```bash
# Always use sudo with pm2
sudo pm2 list
sudo pm2 status
sudo pm2 logs ecohealth-backend
sudo pm2 restart ecohealth-backend --update-env
```

If the process genuinely doesn't exist:

```bash
cd /opt/ecohealth/backend
sudo pm2 start ecosystem.config.js
sudo pm2 save
```

---

### PM2 process doesn't survive reboot

**Symptom**: After a server reboot, the backend is not running.

**Cause**: PM2 startup was not configured, or `pm2 save` was not run
after the last process change.

**Fix**:

```bash
# 1. Start the process
cd /opt/ecohealth/backend
sudo pm2 start ecosystem.config.js

# 2. Save the process list
sudo pm2 save

# 3. Set up PM2 to start on boot
sudo pm2 startup
# This will print a command like:
#   sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root
# Run that printed command.

# 4. Save again
sudo pm2 save
```

---

### Migration skipped / failed

**Symptom**: Logs show `Unique constraint migration skipped: Validation error`
or the database is missing expected tables/indexes.

**Cause**: The migration in `server.js` (`migrateUniqueConstraints()`)
handles historical duplicate data. If it fails, it usually means there
are duplicate rows that need to be reconciled before the unique index
can be created.

**Diagnosis**:

```bash
# Check the full migration logs
sudo pm2 logs ecohealth-backend --lines 50 --nostream | grep -i migrat

# Check which indexes exist
sudo -u postgres psql -d ecohealth -c "\di"
# Expected indexes:
#   uq_appointment_active_slot
#   uq_callroom_active
#   uq_conversation_appointment
#   uq_message_client_id
```

**Clean migration log** (healthy):

```
[migration] No duplicate active conversations found — skipping cleanup
✅ Database synchronized successfully
Server running on port 3000
```

**Problem migration log** (needs attention):

```
[migration] Found 3 duplicate active conversations for appointment abc-123
[migration] Merging messages from conversation def-456 into abc-123
[migration] Error: Validation error
```

If you see errors, check for duplicate data manually:

```sql
-- Find duplicate active conversations
SELECT appointment_id, COUNT(*)
FROM conversations
WHERE status = 'active'
GROUP BY appointment_id
HAVING COUNT(*) > 1;
```

The migration code in `server.js` handles this automatically. If it
fails, check the full error in the logs (the migration logs the
complete error, not just "Validation error").

---

### WebSocket connections fail with "Invalid or expired token"

**Symptom**: Chat and calls don't work. Frontend shows connection errors.

**Cause**: `JWT_SECRET` mismatch between the app server and signaling
server. The app server issues tokens signed with its JWT_SECRET, but
the signaling server tries to verify with a different JWT_SECRET.

**Fix**:

```bash
# Check JWT_SECRET on both servers
sudo grep JWT_SECRET /opt/ecohealth/backend/.env

# They must be identical. If not, copy the app server's value
# to the signaling server and restart:

# On the signaling server:
sudo nano /opt/ecohealth/backend/.env
# Set JWT_SECRET to the app server's value
sudo pm2 restart ecohealth-backend --update-env
```

---

### File downloads return 403 Forbidden

**Symptom**: File URLs (images, documents) return 403.

**Cause**: `FILE_DOWNLOAD_SECRET` mismatch between servers, or the
file is on the other server's MinIO instance.

**Fix**:

```bash
# Check FILE_DOWNLOAD_SECRET on both servers
sudo grep FILE_DOWNLOAD_SECRET /opt/ecohealth/backend/.env

# They must be identical. If not, sync them and restart.
```

---

### Internal API returns 401 Unauthorized

**Symptom**: DND status or caller identity lookups fail. Signaling
server logs show 401 from `/internal/` endpoints.

**Cause**: `INTERNAL_API_SECRET` mismatch between servers.

**Fix**:

```bash
# Check on both servers
sudo grep INTERNAL_API_SECRET /opt/ecohealth/backend/.env

# They must be identical. Sync and restart both.
```

---

### Frontend shows old version after deploy

**Symptom**: Browser shows the old frontend after a deploy.

**Cause**: Browser cache or CDN cache. The Vite build uses content
hashes in filenames, so this is usually a service worker cache issue.

**Fix**:

```bash
# Hard refresh in the browser: Ctrl+Shift+R or Cmd+Shift+R
# Or clear the service worker:
# Chrome DevTools > Application > Service Workers > Unregister

# On the server, verify the new build is in place:
ls -la /opt/ecohealth/frontend/dist/assets/
# Check the timestamps are recent
```

---

### coturn not working

**Symptom**: WebRTC calls fail to connect, especially across different
networks.

**Diagnosis**:

```bash
# Check coturn is running
sudo systemctl status coturn

# Check the port is listening
sudo ss -tuln | grep 3478

# Check the config
sudo cat /etc/turnserver.conf

# Check logs
sudo tail -20 /var/log/turnserver.log
```

**Common issues**:

- `external-ip` not set correctly — coturn needs to know its public IP
  for NAT traversal. The setup script uses `$(detect-external-ip)`.
- Firewall blocking UDP ports — TURN uses port 3478 (TCP+UDP) and
  ephemeral UDP ports for media relay. Open them:

```bash
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 49152:65535/udp  # TURN relay port range
```

---

### SSL certificate expired

**Symptom**: Browser shows "Not secure" or certificate error.

**Fix**:

```bash
# Renew the certificate
sudo certbot renew

# Test the renewal process (dry run)
sudo certbot renew --dry-run

# Certbot should auto-renew via systemd timer, but if it fails:
sudo certbot --nginx -d yourdomain.com
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| Deploy app server | `sudo bash deploy/deploy-app-server.sh` |
| Deploy signaling server | `sudo bash deploy/deploy-signaling-server.sh` |
| Set up app server (fresh) | `sudo bash deploy/setup-app-server.sh` |
| Set up signaling server (fresh) | `sudo bash deploy/setup-signaling-server.sh` |
| Check health | `curl -s https://<domain>/health` |
| PM2 status | `sudo pm2 status` |
| PM2 logs | `sudo pm2 logs ecohealth-backend --lines 30` |
| PM2 error logs | `sudo pm2 logs ecohealth-backend --err --lines 50 --nostream` |
| Restart backend | `sudo pm2 restart ecohealth-backend --update-env` |
| Nginx status | `sudo systemctl status nginx` |
| Nginx reload | `sudo nginx -t && sudo systemctl reload nginx` |
| coturn status | `sudo systemctl status coturn` |
| PostgreSQL shell | `sudo -u postgres psql -d ecohealth` |
| Check port 3000 | `sudo ss -tlnp \| grep 3000` |
