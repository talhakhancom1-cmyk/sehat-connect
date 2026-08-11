#!/bin/bash
# ================================================================
# Sehat Connect — App Server Deployment Script
# For the main app server (e.g. ehcserver.webfrat.com):
#   frontend + REST API + PostgreSQL + MinIO
#
# Usage (on the server, as root or with sudo):
#   sudo bash deploy/deploy-app-server.sh
#
# Or from the app directory:
#   sudo bash /opt/sehat-connect/deploy/deploy-app-server.sh
#
# This script is IDEMPOTENT — safe to run multiple times.
# It NEVER uses nohup, manual kill, or fuser. Only PM2 commands.
# ================================================================
set -euo pipefail

# ---- Configuration ----
APP_DIR="${APP_DIR:-/opt/sehat-connect}"
BRANCH="${BRANCH:-main}"
PM2_NAME="${PM2_NAME:-sehat-connect-backend}"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-30}"  # seconds to wait for health

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
  fail "Please run as root: sudo bash deploy/deploy-app-server.sh"
fi

if [ ! -d "$APP_DIR/.git" ]; then
  fail "Repository not found at $APP_DIR. Clone it first or set APP_DIR."
fi

if ! command -v pm2 &>/dev/null; then
  fail "PM2 is not installed. Run the setup script first: sudo bash deploy/setup-app-server.sh"
fi

if [ ! -f "$APP_DIR/backend/.env" ]; then
  fail "Backend .env not found at $APP_DIR/backend/.env. Configure it first (see deploy/env.app-server.example)."
fi

echo ""
echo "=========================================="
echo "  Sehat Connect — App Server Deploy"
echo "  App dir:  $APP_DIR"
echo "  Branch:   $BRANCH"
echo "  PM2 name: $PM2_NAME"
echo "=========================================="
echo ""

# ================================================================
# STEP 1: Git pull
# ================================================================
info "Step 1/6: Pulling latest code..."
cd "$APP_DIR"
git fetch origin
git reset --hard "origin/$BRANCH"
ok "Code updated to $(git rev-parse --short HEAD)"

# ================================================================
# STEP 2: Install dependencies
# ================================================================
info "Step 2/6: Installing dependencies..."

# Backend
cd "$APP_DIR/backend"
npm install --production 2>&1 | tail -3
ok "Backend dependencies installed."

# Frontend
cd "$APP_DIR"
npm install 2>&1 | tail -3
ok "Frontend dependencies installed."

# ================================================================
# STEP 3: Build frontend
# ================================================================
info "Step 3/6: Building frontend..."
cd "$APP_DIR"

# Ensure .env.production exists (Vite needs it for the API base URL)
if [ ! -f "$APP_DIR/.env.production" ]; then
  warn ".env.production not found. Creating with default /api base."
  echo "VITE_API_BASE_URL=/api" > "$APP_DIR/.env.production"
fi

npm run build 2>&1 | tail -5
ok "Frontend built to $APP_DIR/dist/"

# ================================================================
# STEP 4: Restart backend via PM2 (safe pattern)
# ================================================================
info "Step 4/6: Restarting backend via PM2..."

cd "$APP_DIR/backend"
mkdir -p logs

# Detect if the PM2 process already exists
if sudo pm2 describe "$PM2_NAME" &>/dev/null; then
  # Process exists — restart with --update-env to pick up .env changes
  sudo pm2 restart "$PM2_NAME" --update-env
  ok "PM2 process '$PM2_NAME' restarted with --update-env."
else
  # Process doesn't exist — start it fresh from ecosystem.config.js
  warn "PM2 process '$PM2_NAME' not found. Starting fresh..."
  if [ -f "$APP_DIR/backend/ecosystem.config.js" ]; then
    sudo pm2 start ecosystem.config.js
  else
    sudo pm2 start server.js --name "$PM2_NAME"
  fi
  sudo pm2 save
  ok "PM2 process '$PM2_NAME' started and saved."
fi

# ================================================================
# STEP 5: Wait for health check
# ================================================================
info "Step 5/6: Waiting for health check (up to ${HEALTH_TIMEOUT}s)..."

HEALTH_OK=false
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
  HEALTH_RESP=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
  if [ "$HEALTH_RESP" = "200" ]; then
    HEALTH_OK=true
    break
  fi
  sleep 1
done

if [ "$HEALTH_OK" = true ]; then
  HEALTH_JSON=$(curl -s "$HEALTH_URL" 2>/dev/null || echo "{}")
  DB_STATUS=$(echo "$HEALTH_JSON" | grep -o '"database":"[^"]*"' | head -1 || echo "")
  ok "Health check passed: $HEALTH_URL"
  ok "  $DB_STATUS"
else
  fail "Health check failed after ${HEALTH_TIMEOUT}s. Check logs:
  sudo pm2 logs $PM2_NAME --lines 30 --nostream"
fi

# ================================================================
# STEP 6: Verify Nginx is serving
# ================================================================
info "Step 6/6: Verifying Nginx..."
if systemctl is-active --quiet nginx; then
  ok "Nginx is running."
else
  warn "Nginx is not running. Start it with: sudo systemctl start nginx"
fi

# ================================================================
# Done
# ================================================================
echo ""
echo "=========================================="
echo "  Deploy Complete!"
echo "=========================================="
echo ""
echo "  Commit:     $(git rev-parse --short HEAD)"
echo "  Health:     $HEALTH_URL"
echo "  PM2 status: sudo pm2 status"
echo "  PM2 logs:   sudo pm2 logs $PM2_NAME --lines 30"
echo ""
echo "  If something looks wrong:"
echo "    sudo pm2 logs $PM2_NAME --err --lines 50 --nostream"
echo "    sudo ss -tlnp | grep 3000   # check what's on port 3000"
echo ""
