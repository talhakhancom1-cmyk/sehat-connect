#!/bin/bash
# ================================================================
# EcoHealth — First-Time App Server Setup
# For a FRESH Ubuntu 22/24/26 VPS that will serve as the main app server
# (frontend + REST API + PostgreSQL + MinIO).
#
# Usage (as root):
#   sudo DOMAIN=yourdomain.com ADMIN_EMAIL=admin@yourdomain.com \
#        bash deploy/setup-app-server.sh
#
# Or interactively:
#   sudo bash deploy/setup-app-server.sh
#
# This script:
#   - Installs Node.js, PostgreSQL, Nginx, PM2, MinIO
#   - Creates the database and user
#   - Generates all required secrets
#   - Clones the repo and installs dependencies
#   - Builds the frontend
#   - Configures Nginx (with /api/, /internal/, /ws/, /health blocks)
#   - Sets up PM2 as a systemd service (pm2 startup + pm2 save)
#   - Obtains SSL via certbot
#   - Prints a summary with all generated credentials
#
# NEVER run this on an existing server with data you want to keep.
# It regenerates the .env and resets the database.
# ================================================================
set -euo pipefail

# ---- Configuration ----
DOMAIN="${DOMAIN:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
DB_NAME="${DB_NAME:-ecohealth}"
DB_USER="${DB_USER:-sehat}"
APP_DIR="/opt/ecohealth"
REPO_URL="${REPO_URL:-https://github.com/talhakhancom1-cmyk/ecohealth.git}"
BRANCH="${BRANCH:-main}"
NODE_MAJOR="${NODE_MAJOR:-22}"

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
  fail "Please run as root: sudo DOMAIN=yourdomain.com bash deploy/setup-app-server.sh"
fi

# Interactive prompts for missing config
if [ -z "$DOMAIN" ]; then
  echo ""
  echo "=========================================="
  echo "  EcoHealth — App Server Setup"
  echo "=========================================="
  read -p "  Enter your domain (e.g. example.com): " DOMAIN
  if [ -z "$DOMAIN" ]; then fail "Domain is required."; fi
fi

if [ -z "$ADMIN_EMAIL" ]; then
  ADMIN_EMAIL="admin@$DOMAIN"
  info "Admin email set to: $ADMIN_EMAIL"
fi

if [ -z "$ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)
fi

echo ""
echo "=========================================="
echo "  EcoHealth — App Server Setup"
echo "  Domain:       $DOMAIN"
echo "  Admin email:  $ADMIN_EMAIL"
echo "  App dir:      $APP_DIR"
echo "  Repo:         $REPO_URL ($BRANCH)"
echo "  Node major:   $NODE_MAJOR"
echo "=========================================="
echo ""

# Safety check — don't run on a server that already has data
if [ -f "$APP_DIR/backend/.env" ] && [ -d "$APP_DIR/.git" ]; then
  warn "An existing installation was found at $APP_DIR."
  read -p "  This will RESET the .env and database. Continue? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
  fi
fi

export DEBIAN_FRONTEND=noninteractive

# ================================================================
# STEP 1: Install system packages
# ================================================================
info "Step 1/12: Installing system packages..."

apt-get update -qq

apt-get install -y -qq curl wget git build-essential software-properties-common \
  nginx ufw certbot python3-certbot-nginx postgresql postgresql-contrib \
  ca-certificates gnupg 2>&1 | tail -3

ok "System packages installed."

# ================================================================
# STEP 2: Install Node.js
# ================================================================
info "Step 2/12: Installing Node.js $NODE_MAJOR..."

if ! command -v node &>/dev/null || [[ "$(node -v)" != v$NODE_MAJOR* ]]; then
  rm -f /etc/apt/sources.list.d/nodesource.list 2>/dev/null || true
  curl -fsSL "https://deb.nodesource.com/setup_$NODE_MAJOR.x" | bash -
  apt-get install -y -qq nodejs 2>&1 | tail -3
fi

ok "Node.js installed: $(node -v)"

# Install PM2 globally
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  npm install -g pm2 2>&1 | tail -3
fi
ok "PM2 installed: $(pm2 --version)"

# ================================================================
# STEP 3: Set up PostgreSQL
# ================================================================
info "Step 3/12: Setting up PostgreSQL..."

systemctl start postgresql
systemctl enable postgresql 2>/dev/null || true

# Generate a strong DB password
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)

# Create or update database user
sudo -u postgres psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS'; ELSE ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASS'; END IF; END \$\$;" 2>/dev/null

# Create database if it doesn't exist
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
fi
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || true
sudo -u postgres psql -c "ALTER DATABASE $DB_NAME OWNER TO $DB_USER;" 2>/dev/null || true
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;" 2>/dev/null || true

ok "PostgreSQL ready: database='$DB_NAME' user='$DB_USER'"

# ================================================================
# STEP 4: Set up MinIO
# ================================================================
info "Step 4/12: Setting up MinIO..."

MINIO_ACCESS_KEY=$(openssl rand -base64 12 | tr -d '/+=' | head -c 16)
MINIO_SECRET_KEY=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)

if ! command -v minio &>/dev/null; then
  info "Downloading MinIO server..."
  wget -q https://dl.min.io/server/minio/release/linux-amd64/minio -O /usr/local/bin/minio
  chmod +x /usr/local/bin/minio

  info "Downloading MinIO client (mc)..."
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

# Create bucket
export MC_HOST_local="http://$MINIO_ACCESS_KEY:$MINIO_SECRET_KEY@localhost:9000"
/usr/local/bin/mc mb local/ecohealth-uploads 2>/dev/null || true
/usr/local/bin/mc anonymous set download local/ecohealth-uploads 2>/dev/null || true
unset MC_HOST_local

ok "MinIO ready on port 9000 (bucket: ecohealth-uploads)"

# ================================================================
# STEP 5: Clone repository
# ================================================================
info "Step 5/12: Cloning repository..."

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
# STEP 6: Generate secrets and configure backend .env
# ================================================================
info "Step 6/12: Configuring backend environment..."

cd "$APP_DIR/backend"
mkdir -p logs

# Generate all required secrets
JWT_SECRET=$(openssl rand -hex 48)
FILE_SECRET=$(openssl rand -hex 48)
INTERNAL_SECRET=$(openssl rand -hex 48)

cat > .env <<ENVEOF
# ---- Server ----
PORT=3000
NODE_ENV=production

# ---- PostgreSQL ----
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASS

# ---- Security ----
JWT_SECRET=$JWT_SECRET
FILE_DOWNLOAD_SECRET=$FILE_SECRET

# ---- CORS ----
CORS_ORIGIN=https://$DOMAIN

# ---- Admin seed ----
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD

# ---- MinIO ----
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY
MINIO_SECRET_KEY=$MINIO_SECRET_KEY
MINIO_BUCKET=ecohealth-uploads
MINIO_PUBLIC_BASE_URL=https://$DOMAIN/files

# ---- Internal service-to-service API ----
# MUST be identical on both servers. Share this value with the signaling server.
INTERNAL_API_SECRET=$INTERNAL_SECRET

# ---- WebRTC ICE (STUN + TURN) ----
# Update ICE_TURN_URLS with the signaling server's TURN address after setup.
ICE_STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
ICE_TURN_URLS=turn:<SIGNALING_SERVER_IP>:3478
ICE_TURN_USERNAME=sehat
ICE_TURN_CREDENTIAL=<GENERATE_TURN_CREDENTIAL_ON_SIGNALING_SERVER>

# ---- Calling ----
CALL_RING_TIMEOUT_MS=30000

# ---- AI Symptom Checker ----
# Leave blank to disable. Can also be set from Admin > AI Config panel.
OPENAI_API_KEY=
ENVEOF

chmod 600 .env
ok "Backend .env created at $APP_DIR/backend/.env"

# ================================================================
# STEP 7: Install dependencies
# ================================================================
info "Step 7/12: Installing dependencies..."

cd "$APP_DIR/backend"
npm install --production 2>&1 | tail -3
ok "Backend dependencies installed."

cd "$APP_DIR/frontend"
npm install 2>&1 | tail -3
ok "Frontend dependencies installed."

# ================================================================
# STEP 8: Build frontend
# ================================================================
info "Step 8/12: Building frontend..."

cd "$APP_DIR/frontend"
echo "VITE_API_BASE_URL=/api" > .env.production
npm run build 2>&1 | tail -5
ok "Frontend built to $APP_DIR/frontend/dist/"

# ================================================================
# STEP 9: Configure Nginx
# ================================================================
info "Step 9/12: Configuring Nginx..."

NGINX_SITE="/etc/nginx/sites-available/ecohealth"

# Phase 1: HTTP-only config (for certbot)
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

    location /health {
        proxy_pass http://127.0.0.1:3000/health;
    }
}
HTTPONLY

ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/ecohealth
rm -f /etc/nginx/sites-enabled/default

nginx -t 2>&1
systemctl reload nginx
ok "HTTP-only Nginx configured (for SSL setup)."

# ================================================================
# STEP 10: Start backend with PM2 + set up PM2 systemd service
# ================================================================
info "Step 10/12: Starting backend with PM2..."

cd "$APP_DIR/backend"
pm2 start ecosystem.config.js
pm2 save

# Set up PM2 to start on boot (critical for reboot persistence)
PM2_STARTUP=$(pm2 startup 2>&1 | grep "sudo" | head -1)
if [ -n "$PM2_STARTUP" ]; then
  eval "$PM2_STARTUP" 2>/dev/null || true
fi
pm2 save
ok "PM2 started and configured to start on boot."

# ================================================================
# STEP 11: Obtain SSL certificate
# ================================================================
info "Step 11/12: Obtaining SSL certificate for $DOMAIN..."

certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --email "$ADMIN_EMAIL" 2>&1 || {
  warn "Certbot failed. You can run it manually later:"
  warn "  sudo certbot --nginx -d $DOMAIN"
  warn "Continuing with HTTP-only for now..."
}

# Phase 2: Full HTTPS config (replaces HTTP-only after certbot)
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

# HTTPS - main server
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

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss image/svg+xml;

    # Frontend static files
    root $APP_DIR/frontend/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(?:js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|wasm)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # REST API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Internal service-to-service API (DND + caller identity lookups from signaling server)
    # Protected by INTERNAL_API_SECRET header, NOT user JWT auth.
    location /internal/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
    }

    # WebSocket signaling
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
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        access_log off;
    }

    client_max_body_size 30m;

    access_log /var/log/nginx/ecohealth-access.log;
    error_log /var/log/nginx/ecohealth-error.log;
}
NGINXEOF

  nginx -t 2>&1 && systemctl reload nginx
  ok "Nginx configured with SSL for $DOMAIN"
else
  warn "SSL cert not found. Keeping HTTP-only config."
  warn "Run after DNS propagates: sudo certbot --nginx -d $DOMAIN"
fi

# ================================================================
# STEP 12: Health check
# ================================================================
info "Step 12/12: Waiting for health check..."

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
echo "  App Server Setup Complete!"
echo "=========================================="
echo ""
echo "  Frontend:    https://$DOMAIN"
echo "  API:         https://$DOMAIN/api"
echo "  Health:      https://$DOMAIN/health"
echo ""
echo "  Admin login:"
echo "    Email:     $ADMIN_EMAIL"
echo "    Password:  $ADMIN_PASSWORD"
echo ""
echo "  *** SAVE THESE CREDENTIALS SECURELY ***"
echo ""
echo "  Generated secrets (in $APP_DIR/backend/.env):"
echo "    DB password:         $DB_PASS"
echo "    JWT_SECRET:          $JWT_SECRET"
echo "    FILE_DOWNLOAD_SECRET: $FILE_SECRET"
echo "    INTERNAL_API_SECRET: $INTERNAL_SECRET"
echo "    MinIO access key:    $MINIO_ACCESS_KEY"
echo "    MinIO secret key:    $MINIO_SECRET_KEY"
echo ""
echo "  CRITICAL — Share with signaling server:"
echo "    The INTERNAL_API_SECRET and JWT_SECRET must be identical"
echo "    on the signaling server. Copy these values to the signaling"
echo "    server's .env before starting it."
echo ""
echo "  Next steps:"
echo "  1. Point DNS A record for $DOMAIN to this server's IP"
echo "  2. If SSL failed, run: sudo certbot --nginx -d $DOMAIN"
echo "  3. Set up the signaling server: sudo bash deploy/setup-signaling-server.sh"
echo "  4. Update ICE_TURN_URLS in backend/.env with the signaling server's TURN address"
echo "  5. Log in as admin and configure Email/SMTP and AI settings"
echo ""
