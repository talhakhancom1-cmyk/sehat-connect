#!/bin/bash
# ================================================================
# EcoHealth — First-Time Signaling Server Setup
# For a FRESH Ubuntu 22/24/26 VPS that will serve as the
# WebSocket/WebRTC/TURN signaling server.
#
# Usage (as root):
#   sudo DOMAIN=yourdomain.com \
#        APP_SERVER_DOMAIN=ehcserver.webfrat.com \
#        JWT_SECRET=<from_app_server> \
#        FILE_DOWNLOAD_SECRET=<from_app_server> \
#        INTERNAL_API_SECRET=<from_app_server> \
#        bash deploy/setup-signaling-server.sh
#
# Or interactively (will prompt for required shared secrets):
#   sudo bash deploy/setup-signaling-server.sh
#
# This script:
#   - Installs Node.js, Nginx, PM2, coturn
#   - Installs MinIO (for legacy file uploads)
#   - Clones the repo and installs backend dependencies
#   - Configures coturn (TURN relay for WebRTC)
#   - Configures Nginx (with /api/, /ws/, /health blocks)
#   - Sets up PM2 as a systemd service (pm2 startup + pm2 save)
#   - Obtains SSL via certbot
#
# NEVER run this on an existing server with data you want to keep.
# ================================================================
set -euo pipefail

# ---- Configuration ----
DOMAIN="${DOMAIN:-}"
APP_SERVER_DOMAIN="${APP_SERVER_DOMAIN:-}"
DB_NAME="${DB_NAME:-ecohealth}"
DB_USER="${DB_USER:-sehat}"
APP_DIR="/opt/ecohealth"
REPO_URL="${REPO_URL:-https://github.com/talhakhancom1-cmyk/ecohealth.git}"
BRANCH="${BRANCH:-main}"
NODE_MAJOR="${NODE_MAJOR:-22}"

# Shared secrets (MUST match the app server)
JWT_SECRET="${JWT_SECRET:-}"
FILE_DOWNLOAD_SECRET="${FILE_DOWNLOAD_SECRET:-}"
INTERNAL_API_SECRET="${INTERNAL_API_SECRET:-}"

# ---- Colors ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
fail()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ---- Pre-flight checks ----
if [ "$EUID" -ne 0 ]; then
  fail "Please run as root: sudo DOMAIN=yourdomain.com bash deploy/setup-signaling-server.sh"
fi

# Interactive prompts
if [ -z "$DOMAIN" ]; then
  echo ""
  echo "=========================================="
  echo "  EcoHealth — Signaling Server Setup"
  echo "=========================================="
  read -p "  Enter this server's domain (e.g. afridiwins.online): " DOMAIN
  if [ -z "$DOMAIN" ]; then fail "Domain is required."; fi
fi

if [ -z "$APP_SERVER_DOMAIN" ]; then
  read -p "  Enter the app server's domain (e.g. ehcserver.webfrat.com): " APP_SERVER_DOMAIN
  if [ -z "$APP_SERVER_DOMAIN" ]; then fail "App server domain is required."; fi
fi

echo ""
echo "  Shared secrets must be IDENTICAL to the app server."
echo "  Copy them from the app server's backend/.env file."
echo ""

if [ -z "$JWT_SECRET" ]; then
  read -p "  JWT_SECRET (from app server): " JWT_SECRET
  if [ -z "$JWT_SECRET" ]; then fail "JWT_SECRET is required."; fi
fi

if [ -z "$FILE_DOWNLOAD_SECRET" ]; then
  read -p "  FILE_DOWNLOAD_SECRET (from app server): " FILE_DOWNLOAD_SECRET
  if [ -z "$FILE_DOWNLOAD_SECRET" ]; then fail "FILE_DOWNLOAD_SECRET is required."; fi
fi

if [ -z "$INTERNAL_API_SECRET" ]; then
  read -p "  INTERNAL_API_SECRET (from app server): " INTERNAL_API_SECRET
  if [ -z "$INTERNAL_API_SECRET" ]; then fail "INTERNAL_API_SECRET is required."; fi
fi

echo ""
echo "=========================================="
echo "  EcoHealth — Signaling Server Setup"
echo "  Domain:           $DOMAIN"
echo "  App server:       $APP_SERVER_DOMAIN"
echo "  App dir:          $APP_DIR"
echo "  Repo:             $REPO_URL ($BRANCH)"
echo "  Node major:       $NODE_MAJOR"
echo "=========================================="
echo ""

# Safety check
if [ -f "$APP_DIR/backend/.env" ] && [ -d "$APP_DIR/.git" ]; then
  warn "An existing installation was found at $APP_DIR."
  read -p "  This will RESET the .env. Continue? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
  fi
fi

export DEBIAN_FRONTEND=noninteractive

# ================================================================
# STEP 1: Install system packages
# ================================================================
info "Step 1/10: Installing system packages..."

apt-get update -qq

apt-get install -y -qq curl wget git build-essential software-properties-common \
  nginx ufw certbot python3-certbot-nginx coturn \
  ca-certificates gnupg 2>&1 | tail -3

ok "System packages installed."

# ================================================================
# STEP 2: Install Node.js + PM2
# ================================================================
info "Step 2/10: Installing Node.js $NODE_MAJOR..."

if ! command -v node &>/dev/null || [[ "$(node -v)" != v$NODE_MAJOR* ]]; then
  rm -f /etc/apt/sources.list.d/nodesource.list 2>/dev/null || true
  curl -fsSL "https://deb.nodesource.com/setup_$NODE_MAJOR.x" | bash -
  apt-get install -y -qq nodejs 2>&1 | tail -3
fi

ok "Node.js installed: $(node -v)"

if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  npm install -g pm2 2>&1 | tail -3
fi
ok "PM2 installed: $(pm2 --version)"

# ================================================================
# STEP 3: Set up PostgreSQL (signaling server has its own DB for calls/messages)
# ================================================================
info "Step 3/10: Setting up PostgreSQL..."

systemctl start postgresql
systemctl enable postgresql 2>/dev/null || true

DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)

sudo -u postgres psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS'; ELSE ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASS'; END IF; END \$\$;" 2>/dev/null

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
fi
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || true
sudo -u postgres psql -c "ALTER DATABASE $DB_NAME OWNER TO $DB_USER;" 2>/dev/null || true
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;" 2>/dev/null || true

ok "PostgreSQL ready: database='$DB_NAME' user='$DB_USER'"

# ================================================================
# STEP 4: Set up MinIO (for legacy file uploads)
# ================================================================
info "Step 4/10: Setting up MinIO..."

MINIO_ACCESS_KEY=$(openssl rand -base64 12 | tr -d '/+=' | head -c 16)
MINIO_SECRET_KEY=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)

if ! command -v minio &>/dev/null; then
  wget -q https://dl.min.io/server/minio/release/linux-amd64/minio -O /usr/local/bin/minio
  chmod +x /usr/local/bin/minio
  wget -q https://dl.min.io/client/mc/release/linux-amd64/mc -O /usr/local/bin/mc
  chmod +x /usr/local/bin/mc
fi

mkdir -p /data/minio

cat > /etc/systemd/system/minio.service <<MINIOEOF
[Unit]
Description=MinIO Object Storage
After=network.target

[Service]
Type=simple
User=root
Environment="MINIO_ROOT_USER=$MINIO_ACCESS_KEY"
Environment="MINIO_ROOT_PASSWORD=$MINIO_SECRET_KEY"
ExecStart=/usr/local/bin/minio server /data/minio --address ":9000"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
MINIOEOF

systemctl daemon-reload
systemctl enable minio
systemctl restart minio
sleep 3

export MC_HOST_local="http://$MINIO_ACCESS_KEY:$MINIO_SECRET_KEY@localhost:9000"
/usr/local/bin/mc mb local/ecohealth-uploads 2>/dev/null || true
/usr/local/bin/mc anonymous set download local/ecohealth-uploads 2>/dev/null || true
unset MC_HOST_local

ok "MinIO ready on port 9000"

# ================================================================
# STEP 5: Configure coturn (TURN relay)
# ================================================================
info "Step 5/10: Configuring coturn..."

TURN_USERNAME="sehat"
TURN_CREDENTIAL=$(openssl rand -base64 18 | tr -d '/+=' | head -c 24)
TURN_REALM="$DOMAIN"

# Enable coturn daemon
sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || true

cat > /etc/turnserver.conf <<TURNEOF
# coturn TURN server config for EcoHealth
listening-port=3478
listening-ip=0.0.0.0
external-ip=\$(detect-external-ip)

# TURN credentials
user=$TURN_USERNAME:$TURN_CREDENTIAL
realm=$TURN_REALM
server-name=$TURN_REALM

# Log
log-file=/var/log/turnserver.log
simple-log

# Security
no-cli
fingerprint
no-tls
no-dtls
no-multicast-peers
no-loopback-peers
# Prevent relay to private networks
no-stun
# Block traffic to localhost
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
TURNEOF

systemctl enable coturn
systemctl restart coturn
ok "coturn configured (user: $TURN_USERNAME, realm: $TURN_REALM)"

# ================================================================
# STEP 6: Clone repository
# ================================================================
info "Step 6/10: Cloning repository..."

if [ ! -d "$APP_DIR/.git" ]; then
  if git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$APP_DIR" 2>/dev/null; then
    ok "Repository cloned."
  else
    fail "Could not clone repository. Check network and repo URL: $REPO_URL"
  fi
else
  info "Repository already exists. Pulling latest..."
  cd "$APP_DIR"
  git fetch origin
  git reset --hard "origin/$BRANCH"
  ok "Repository updated."
fi

# ================================================================
# STEP 7: Configure backend .env
# ================================================================
info "Step 7/10: Configuring backend environment..."

cd "$APP_DIR/backend"
mkdir -p logs

cat > .env <<ENVEOF
# ---- Server ----
PORT=3000
NODE_ENV=production

# ---- PostgreSQL (local DB on this server) ----
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASS

# ---- Security (MUST match app server) ----
JWT_SECRET=$JWT_SECRET
FILE_DOWNLOAD_SECRET=$FILE_DOWNLOAD_SECRET

# ---- CORS ----
CORS_ORIGIN=https://$DOMAIN,https://$APP_SERVER_DOMAIN

# ---- MinIO ----
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY
MINIO_SECRET_KEY=$MINIO_SECRET_KEY
MINIO_BUCKET=ecohealth-uploads
MINIO_PUBLIC_BASE_URL=https://$DOMAIN/files

# ---- Internal service-to-service API ----
# MUST match app server. Used for DND + caller identity lookups.
INTERNAL_API_SECRET=$INTERNAL_API_SECRET
# Base URL of the app server's internal API
INTERNAL_API_BASE=https://$APP_SERVER_DOMAIN

# ---- WebRTC ICE (STUN + TURN) ----
ICE_STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
ICE_TURN_URLS=turn:$DOMAIN:3478
ICE_TURN_USERNAME=$TURN_USERNAME
ICE_TURN_CREDENTIAL=$TURN_CREDENTIAL

# ---- Calling ----
CALL_RING_TIMEOUT_MS=30000

# ---- AI Symptom Checker ----
# Optional on signaling server. Can be set from Admin > AI Config panel.
OPENAI_API_KEY=
ENVEOF

chmod 600 .env
ok "Backend .env created at $APP_DIR/backend/.env"

# ================================================================
# STEP 8: Install dependencies + start PM2
# ================================================================
info "Step 8/10: Installing dependencies and starting PM2..."

cd "$APP_DIR/backend"
npm install --production 2>&1 | tail -3
ok "Backend dependencies installed."

pm2 start ecosystem.config.js
pm2 save

# PM2 startup for reboot persistence
PM2_STARTUP=$(pm2 startup 2>&1 | grep "sudo" | head -1)
if [ -n "$PM2_STARTUP" ]; then
  eval "$PM2_STARTUP" 2>/dev/null || true
fi
pm2 save
ok "PM2 started and configured to start on boot."

# ================================================================
# STEP 9: Configure Nginx + SSL
# ================================================================
info "Step 9/10: Configuring Nginx..."

NGINX_SITE="/etc/nginx/sites-available/ecohealth"

# Phase 1: HTTP-only (for certbot)
cat > "$NGINX_SITE" <<HTTPONLY
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    location /health {
        proxy_pass http://127.0.0.1:3000/health;
    }
}
HTTPONLY

ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/ecohealth
rm -f /etc/nginx/sites-enabled/default

nginx -t 2>&1
systemctl reload nginx
ok "HTTP-only Nginx configured."

# Obtain SSL
info "Obtaining SSL certificate for $DOMAIN..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --email "admin@$DOMAIN" 2>&1 || {
  warn "Certbot failed. Run manually later: sudo certbot --nginx -d $DOMAIN"
}

# Phase 2: Full HTTPS config
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  info "Writing full HTTPS Nginx config..."

  cat > "$NGINX_SITE" <<NGINXEOF
# HTTP -> HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS - signaling server
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript;

    # REST API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }

    # WebSocket signaling (critical for real-time calls/chat)
    location /ws/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        access_log off;
    }

    # MinIO file proxy (legacy uploads)
    location /files/ {
        proxy_pass http://127.0.0.1:9000/ecohealth-uploads/;
        proxy_set_header Host \$host;
    }

    client_max_body_size 30m;

    access_log /var/log/nginx/ecohealth-access.log;
    error_log /var/log/nginx/ecohealth-error.log;
}
NGINXEOF

  nginx -t 2>&1 && systemctl reload nginx
  ok "Nginx configured with SSL for $DOMAIN"
else
  warn "SSL cert not found. Run: sudo certbot --nginx -d $DOMAIN"
fi

# ================================================================
# STEP 10: Health check
# ================================================================
info "Step 10/10: Waiting for health check..."

HEALTH_OK=false
for i in $(seq 1 30); do
  HEALTH_RESP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null || echo "000")
  if [ "$HEALTH_RESP" = "200" ]; then
    HEALTH_OK=true
    break
  fi
  sleep 1
done

if [ "$HEALTH_OK" = true ]; then
  ok "Health check passed!"
else
  warn "Health check failed. Check: sudo pm2 logs ecohealth-backend --lines 30"
fi

# ================================================================
# Done — Print summary
# ================================================================
echo ""
echo "=========================================="
echo "  Signaling Server Setup Complete!"
echo "=========================================="
echo ""
echo "  Health:      https://$DOMAIN/health"
echo "  WebSocket:   wss://$DOMAIN/ws/"
echo "  TURN:        $DOMAIN:3478"
echo ""
echo "  *** SAVE THESE CREDENTIALS SECURELY ***"
echo ""
echo "  Generated secrets (in $APP_DIR/backend/.env):"
echo "    DB password:         $DB_PASS"
echo "    MinIO access key:    $MINIO_ACCESS_KEY"
echo "    MinIO secret key:    $MINIO_SECRET_KEY"
echo "    TURN username:       $TURN_USERNAME"
echo "    TURN credential:     $TURN_CREDENTIAL"
echo ""
echo "  Shared secrets (copied from app server):"
echo "    JWT_SECRET:          [set from app server]"
echo "    FILE_DOWNLOAD_SECRET: [set from app server]"
echo "    INTERNAL_API_SECRET: [set from app server]"
echo ""
echo "  Next steps:"
echo "  1. Point DNS A record for $DOMAIN to this server's IP"
echo "  2. If SSL failed, run: sudo certbot --nginx -d $DOMAIN"
echo "  3. Update the app server's backend/.env ICE_TURN_URLS to:"
echo "     ICE_TURN_URLS=turn:$DOMAIN:3478"
echo "     ICE_TURN_USERNAME=$TURN_USERNAME"
echo "     ICE_TURN_CREDENTIAL=$TURN_CREDENTIAL"
echo "  4. Test the internal API from this server to the app server:"
echo "     curl -s -H 'x-internal-secret: $INTERNAL_API_SECRET' \\"
echo "       https://$APP_SERVER_DOMAIN/internal/users/<some-user-id>"
echo ""
