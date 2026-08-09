#!/bin/bash
# ================================================================
# Sehat Connect — VPS Deployment Script for Ubuntu 26
# Target: ehcserver.webfrat.com
# Stack: Node.js + Express + PostgreSQL 18 + Nginx + PM2 + MinIO + Redis
# ================================================================
set -e

DOMAIN="ehcserver.webfrat.com"
APP_DIR="/opt/sehat-connect"
BACKEND_DIR="$APP_DIR/backend"
DIST_DIR="$APP_DIR/dist"
NGINX_SITE="/etc/nginx/sites-available/sehat-connect"

echo "=========================================="
echo "  Sehat Connect — VPS Deployment"
echo "  Domain: $DOMAIN"
echo "=========================================="

# ---- 1. PostgreSQL database ----
echo ""
echo "[1/8] Setting up PostgreSQL database..."
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='sehat'" | grep -q 1; then
  echo "  Creating database user 'sehat'..."
  sudo -u postgres psql -c "CREATE USER sehat WITH PASSWORD '$(openssl rand -base64 24)';"
else
  echo "  User 'sehat' already exists."
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='sehat_connect'" | grep -q 1; then
  echo "  Creating database 'sehat_connect'..."
  sudo -u postgres psql -c "CREATE DATABASE sehat_connect OWNER sehat;"
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE sehat_connect TO sehat;"
else
  echo "  Database 'sehat_connect' already exists."
fi

# ---- 2. Application directory ----
echo ""
echo "[2/8] Setting up application directory..."
if [ ! -d "$APP_DIR" ]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown -R "$USER":"$USER" "$APP_DIR"
fi

# ---- 3. Install backend dependencies ----
echo ""
echo "[3/8] Installing backend dependencies..."
cd "$BACKEND_DIR"
npm ci --production

# ---- 4. Install frontend dependencies & build ----
echo ""
echo "[4/8] Building frontend..."
cd "$APP_DIR"
npm ci
echo "VITE_API_BASE_URL=https://$DOMAIN/api" > .env.production
npm run build

# ---- 5. Configure backend .env ----
echo ""
echo "[5/8] Configuring backend environment..."
cd "$BACKEND_DIR"
if [ ! -f .env ]; then
  echo "  Creating .env from template..."
  JWT_SECRET=$(openssl rand -hex 48)
  FILE_SECRET=$(openssl rand -hex 48)
  DB_PASS=$(sudo -u postgres psql -tAc "SELECT rolpassword FROM pg_authid WHERE rolname='sehat'" | head -c 40 || echo 'changeme')

  cat > .env <<ENVEOF
PORT=3000
NODE_ENV=production

DB_HOST=localhost
DB_PORT=5432
DB_NAME=sehat_connect
DB_USER=sehat
DB_PASSWORD=$DB_PASS

JWT_SECRET=$JWT_SECRET
FILE_DOWNLOAD_SECRET=$FILE_SECRET

CORS_ORIGIN=https://$DOMAIN

ADMIN_EMAIL=admin@$DOMAIN
ADMIN_PASSWORD=$(openssl rand -base64 18)

MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=sehat-uploads
MINIO_PUBLIC_BASE_URL=https://$DOMAIN/files
ENVEOF
  echo "  .env created. REVIEW IT: nano $BACKEND_DIR/.env"
else
  echo "  .env already exists. Skipping."
fi

mkdir -p "$BACKEND_DIR/logs"

# ---- 6. PM2 ----
echo ""
echo "[6/8] Starting backend with PM2..."
cd "$BACKEND_DIR"
pm2 delete sehat-connect-backend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
echo "  PM2 startup (follow instructions if printed):"
pm2 startup 2>/dev/null || true

# ---- 7. Nginx ----
echo ""
echo "[7/8] Configuring Nginx..."
if [ ! -f "$NGINX_SITE" ]; then
  sudo cp "$BACKEND_DIR/nginx.conf" "$NGINX_SITE"
fi
# Enable site
sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/sehat-connect
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# ---- 8. SSL with Certbot ----
echo ""
echo "[8/8] Setting up SSL with Certbot..."
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect || {
  echo "  ⚠️  Certbot failed. Run manually: sudo certbot --nginx -d $DOMAIN"
}

# ---- Done ----
echo ""
echo "=========================================="
echo "  Deployment Complete!"
echo "=========================================="
echo ""
echo "  Frontend:  https://$DOMAIN"
echo "  API:       https://$DOMAIN/api"
echo "  Health:    https://$DOMAIN/health"
echo ""
echo "  Backend .env: $BACKEND_DIR/.env"
echo "  PM2 logs:     pm2 logs sehat-connect-backend"
echo "  PM2 status:   pm2 status"
echo ""
echo "  Next steps:"
echo "  1. Review .env: nano $BACKEND_DIR/.env"
echo "  2. Set MinIO credentials if different from defaults"
echo "  3. Restart backend after .env changes: pm2 restart sehat-connect-backend"
echo ""
