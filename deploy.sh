#!/bin/bash
# ================================================================
# EcoHealth — Full VPS Deployment Script
# Works on a fresh Ubuntu 22/24/26 VPS
#
# Usage:
#   sudo DOMAIN=yourdomain.com ADMIN_EMAIL=admin@yourdomain.com bash deploy.sh
#
# Or interactively (will prompt for domain):
#   sudo bash deploy.sh
# ================================================================
set -euo pipefail

# ---- Configuration (override via environment variables) ----
DOMAIN="${DOMAIN:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
DB_NAME="${DB_NAME:-ecohealth}"
DB_USER="${DB_USER:-sehat}"
APP_DIR="/opt/ecohealth"
REPO_URL="${REPO_URL:-git@github.com:talhakhancom1-cmyk/ecohealth.git}"
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
  fail "Please run as root: sudo DOMAIN=yourdomain.com bash deploy.sh"
fi

if [ -z "$DOMAIN" ]; then
  echo ""
  echo "=========================================="
  echo "  EcoHealth — VPS Deployment"
  echo "=========================================="
  read -p "  Enter your domain (e.g. example.com): " DOMAIN
  if [ -z "$DOMAIN" ]; then fail "Domain is required."; fi
fi

if [ -z "$ADMIN_EMAIL" ]; then
  ADMIN_EMAIL="admin@$DOMAIN"
fi

if [ -z "$ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)
fi

echo ""
echo "=========================================="
echo "  EcoHealth — VPS Deployment"
echo "  Domain:       $DOMAIN"
echo "  Admin email:  $ADMIN_EMAIL"
echo "  App dir:      $APP_DIR"
echo "  Repo:         $REPO_URL ($BRANCH)"
echo "=========================================="
echo ""

# ================================================================
# STEP 1: Install system packages
# ================================================================
info "Step 1/10: Installing system packages..."

export DEBIAN_FRONTEND=noninteractive

# Update package list
apt-get update -qq

# Install base packages
apt-get install -y -qq curl wget git build-essential software-properties-common \
  nginx ufw certbot python3-certbot-nginx postgresql postgresql-contrib \
  redis-server ca-certificates gnupg 2>&1 | tail -3

ok "System packages installed."

# ================================================================
# STEP 2: Install Node.js (via NodeSource)
# ================================================================
info "Step 2/10: Installing Node.js $NODE_MAJOR..."

if ! command -v node &>/dev/null || [[ "$(node -v)" != v$NODE_MAJOR* ]]; then
  # Remove old NodeSource setup if exists
  rm -f /etc/apt/sources.list.d/nodesource.list 2>/dev/null || true
  
  curl -fsSL "https://deb.nodesource.com/setup_$NODE_MAJOR.x" | bash -
  apt-get install -y -qq nodejs 2>&1 | tail -3
fi

NODE_VERSION=$(node -v)
ok "Node.js installed: $NODE_VERSION"

# Install PM2 globally
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  npm install -g pm2 2>&1 | tail -3
fi
ok "PM2 installed: $(pm2 --version)"

# ================================================================
# STEP 3: Set up PostgreSQL
# ================================================================
info "Step 3/10: Setting up PostgreSQL..."

# Ensure PostgreSQL is running
systemctl start postgresql
systemctl enable postgresql 2>/dev/null || true

# Generate a strong DB password
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)

# Create database user (drop if exists and recreate to ensure clean password)
sudo -u postgres psql -c "DROP USER IF EXISTS $DB_USER;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || true
sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || true

# Create database
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
fi
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -c "ALTER DATABASE $DB_NAME OWNER TO $DB_USER;"

# Grant schema permissions (needed for Sequelize sync)
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;" 2>/dev/null || true

ok "PostgreSQL ready: database='$DB_NAME' user='$DB_USER'"

# ================================================================
# STEP 4: Set up MinIO (S3-compatible object storage)
# ================================================================
info "Step 4/10: Setting up MinIO..."

MINIO_ACCESS_KEY=$(openssl rand -base64 12 | tr -d '/+=' | head -c 16)
MINIO_SECRET_KEY=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)

# Download and install MinIO if not present
if ! command -v minio &>/dev/null; then
  info "Downloading MinIO server..."
  wget -q https://dl.min.io/server/minio/release/linux-amd64/minio -O /usr/local/bin/minio
  chmod +x /usr/local/bin/minio
  
  info "Downloading MinIO client (mc)..."
  wget -q https://dl.min.io/client/mc/release/linux-amd64/mc -O /usr/local/bin/mc
  chmod +x /usr/local/bin/mc
fi

# Create MinIO data directory
mkdir -p /data/minio
chown -R root:root /data/minio

# Create MinIO systemd service
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

# Wait for MinIO to start
sleep 3

# Create bucket using mc
export MC_HOST_local="http://$MINIO_ACCESS_KEY:$MINIO_SECRET_KEY@localhost:9000"
/usr/local/bin/mc mb local/ecohealth-uploads 2>/dev/null || true
/usr/local/bin/mc anonymous set download local/ecohealth-uploads 2>/dev/null || true
unset MC_HOST_local

ok "MinIO ready on port 9000 (bucket: ecohealth-uploads)"

# ================================================================
# STEP 5: Clone repository
# ================================================================
info "Step 5/10: Cloning repository..."

# Set up SSH deploy key (user must add to GitHub)
if [ ! -f /opt/ecohealth/.git ]; then
  # Try SSH first, fall back to HTTPS
  if git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$APP_DIR" 2>/dev/null; then
    ok "Repository cloned via SSH."
  else
    warn "SSH clone failed. Trying HTTPS..."
    HTTPS_REPO=$(echo "$REPO_URL" | sed 's/git@github.com:/https:\/\/github.com\//')
    if git clone --depth 1 -b "$BRANCH" "$HTTPS_REPO" "$APP_DIR" 2>/dev/null; then
      ok "Repository cloned via HTTPS."
    else
      fail "Could not clone repository. Check your network and GitHub access."
    fi
  fi
else
  info "Repository already exists. Pulling latest..."
  cd "$APP_DIR"
  git fetch origin
  git reset --hard "origin/$BRANCH"
  ok "Repository updated."
fi

# ================================================================
# STEP 6: Configure backend .env
# ================================================================
info "Step 6/10: Configuring backend environment..."

cd "$APP_DIR/backend"
mkdir -p logs

# Generate secrets
JWT_SECRET=$(openssl rand -hex 48)
FILE_SECRET=$(openssl rand -hex 48)

# Always write a fresh .env (so passwords are consistent)
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

# ---- Redis ----
REDIS_URL=redis://localhost:6379
ENVEOF

chmod 600 .env
ok "Backend .env created at $APP_DIR/backend/.env"

# ================================================================
# STEP 7: Install dependencies
# ================================================================
info "Step 7/10: Installing dependencies..."

# Backend
cd "$APP_DIR/backend"
npm install --production 2>&1 | tail -3
ok "Backend dependencies installed."

# Frontend
cd "$APP_DIR"
npm install 2>&1 | tail -3
ok "Frontend dependencies installed."

# ================================================================
# STEP 8: Build frontend
# ================================================================
info "Step 8/10: Building frontend..."

cd "$APP_DIR"
echo "VITE_API_BASE_URL=https://$DOMAIN/api" > .env.production
npm run build 2>&1 | tail -5
ok "Frontend built to $APP_DIR/dist/"

# ================================================================
# STEP 9: Configure Nginx + SSL
# ================================================================
info "Step 9/10: Configuring Nginx..."

NGINX_SITE="/etc/nginx/sites-available/ecohealth"

# ---- Phase 1: HTTP-only config (so certbot can obtain the cert) ----
cat > "$NGINX_SITE" <<'HTTPONLY'
# EcoHealth — temporary HTTP-only config for certbot
server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_PLACEHOLDER;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Proxy everything to backend temporarily (frontend served once SSL is ready)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /health {
        proxy_pass http://127.0.0.1:3000/health;
    }
}
HTTPONLY

# Replace placeholder with actual domain
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/" "$NGINX_SITE"

# Enable site
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/ecohealth
rm -f /etc/nginx/sites-enabled/default

nginx -t 2>&1
systemctl reload nginx
ok "HTTP-only Nginx configured (for SSL certificate setup)."

# Get SSL certificate
info "Obtaining SSL certificate for $DOMAIN..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --email "$ADMIN_EMAIL" 2>&1 || {
  warn "Certbot failed. You can run it manually later:"
  warn "  sudo certbot --nginx -d $DOMAIN"
  warn "Continuing with HTTP-only for now..."
}

# ---- Phase 2: Full HTTPS config (replaces the temporary one) ----
cat > "$NGINX_SITE" <<NGINXEOF
# EcoHealth — Nginx configuration for $DOMAIN
# Auto-generated by deploy.sh

# HTTP → HTTPS redirect
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

# HTTPS — main server
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $DOMAIN;

    # SSL certificates (managed by certbot)
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

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss application/atom+xml image/svg+xml;

    # Frontend static files (Vite build output)
    root $APP_DIR/dist;
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

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        proxy_send_timeout 300s;
    }

    # WebSocket proxy for Socket.IO
    location /ws/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400s;
        proxy_connect_timeout 75s;
        proxy_send_timeout 86400s;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        access_log off;
    }

    # MinIO file proxy (optional)
    # location /files/ {
    #     proxy_pass http://127.0.0.1:9000/ecohealth-uploads/;
    #     proxy_set_header Host \$host;
    # }

    client_max_body_size 30m;

    access_log /var/log/nginx/ecohealth-access.log;
    error_log /var/log/nginx/ecohealth-error.log;
}
NGINXEOF

# Test and reload — if SSL certs don't exist yet, fall back to HTTP-only
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  nginx -t 2>&1 && systemctl reload nginx
  ok "Nginx configured with SSL for $DOMAIN"
else
  warn "SSL cert not found. Keeping HTTP-only config."
  warn "Run after DNS propagates: sudo certbot --nginx -d $DOMAIN"
  # Write back the HTTP-only config
  cat > "$NGINX_SITE" <<'HTTPONLY2'
server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_PLACEHOLDER;

    root /opt/ecohealth/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location /health {
        proxy_pass http://127.0.0.1:3000/health;
    }
}
HTTPONLY2
  sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/" "$NGINX_SITE"
  nginx -t 2>&1 && systemctl reload nginx
fi

# ================================================================
# STEP 10: Start backend with PM2
# ================================================================
info "Step 10/10: Starting backend with PM2..."

cd "$APP_DIR/backend"
pm2 delete ecohealth-backend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# Set up PM2 to start on boot
PM2_STARTUP=$(pm2 startup 2>&1 | grep "sudo" | head -1)
if [ -n "$PM2_STARTUP" ]; then
  eval "$PM2_STARTUP" 2>/dev/null || true
fi
pm2 save

ok "Backend started with PM2."

# ================================================================
# DONE — Print summary
# ================================================================
echo ""
echo "=========================================="
echo "  Deployment Complete!"
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
echo "  IMPORTANT — Save these credentials:"
echo "  Backend .env: $APP_DIR/backend/.env"
echo "  DB password:  $DB_PASS"
echo "  MinIO keys:   $MINIO_ACCESS_KEY / $MINIO_SECRET_KEY"
echo ""
echo "  Useful commands:"
echo "    pm2 status                    # Check backend status"
echo "    pm2 logs ecohealth-backend # View logs"
echo "    sudo systemctl status nginx   # Check Nginx"
echo "    sudo systemctl status minio   # Check MinIO"
echo "    sudo systemctl status postgresql # Check DB"
echo ""
echo "  Next steps:"
echo "  1. Log in with the admin credentials above"
echo "  2. Go to Admin > Email / SMTP to configure email"
echo "  3. Go to Admin > API Keys to create API keys"
echo "  4. Point your domain's DNS A record to this server's IP"
echo ""
