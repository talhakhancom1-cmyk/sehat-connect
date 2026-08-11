# EcoHealth — Developer Guide
---

## 2. Live URLs

| Service | URL |
|---------|-----|
| **Frontend (HTTPS)** | https://afridiwins.online |
| **Frontend (WWW)** | https://www.afridiwins.online |
| **API Base** | https://afridiwins.online/api |
| **API v1 Base** | https://afridiwins.online/api/v1 |
| **Health Check** | https://afridiwins.online/health |
| **MinIO API** | `127.0.0.1:9000` (internal only) |
| **MinIO Console** | `127.0.0.1:9001` (internal only) |

---

## 3. Admin Account

| Detail | Value |
|--------|-------|
| **Email** | `admin@ecohealth.local` |
| **Password** | `cLKArLVZF6f0dO8dny7MGoMB` |
| **Role** | `super_admin` |

### Login via API
```bash
curl -X POST https://afridiwins.online/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ecohealth.local","password":"cLKArLVZF6f0dO8dny7MGoMB"}'
```

### Login via Web
Open https://afridiwins.online and use the credentials above.

---

## 4. Installed Software

| Software | Version | Status |
|----------|---------|--------|
| **Node.js** | v18.19.1 | Active |
| **npm** | 9.2.0 | Active |
| **PM2** | 7.0.3 | Active (manages backend) |
| **PostgreSQL** | 16.14 | Active (systemd) |
| **Nginx** | 1.24.0 | Active (systemd) |
| **MinIO** | RELEASE.2025-09-07 | Active (systemd) |
| **Certbot** | 2.9.0 | Active (auto-renew) |
| **Git** | 2.43.0 | Installed |
| **UFW Firewall** | Active | SSH, HTTP, HTTPS open |

---

## 5. File Structure on VPS

```
/opt/ecohealth/                    ← Application root
├── .env.production                    ← Frontend API URL (VITE_API_BASE_URL)
├── dist/                              ← Built frontend (served by Nginx)
│   ├── index.html
│   ├── favicon.svg
│   ├── manifest.json
│   └── assets/                        ← JS, CSS bundles
├── public/                            ← Static assets
│   ├── favicon.svg
│   └── manifest.json
└── backend/                           ← Backend API
    ├── .env                           ← Production environment config (SECRETS)
    ├── env.example                    ← Template (safe to share)
    ├── server.js                      ← Express server entry point
    ├── ecosystem.config.js            ← PM2 process config
    ├── nginx.conf                     ← Nginx site config (reference copy)
    ├── package.json                   ← Backend dependencies
    ├── package-lock.json
    ├── node_modules/                  ← Installed dependencies
    ├── logs/                          ← PM2 log files
    │   ├── out.log
    │   └── error.log
    ├── config/
    │   ├── database.js                ← PostgreSQL connection + Sequelize
    │   └── minio.js                   ← MinIO (S3) client for file storage
    ├── constants/
    │   └── ehc.js                     ← App constants
    ├── middleware/
    │   └── auth.js                    ← JWT authentication + role checks
    ├── lib/
    │   ├── audit.js                   ← Audit logging helper
    │   ├── parseSort.js               ← Sort parameter parser
    │   ├── paymentProvider.js         ← Payment abstraction
    │   ├── pdfGenerator.js            ← PDF generation (stub)
    │   └── socketEvents.js            ← Socket.IO events (placeholder)
    ├── models/                        ← 50 Sequelize models
    │   ├── User.js                    ← Canonical user + roles
    │   ├── Doctor.js
    │   ├── Appointment.js
    │   ├── MedicalRecord.js
    │   ├── Prescription.js
    │   ├── HealthCard.js
    │   ├── Household.js
    │   ├── ... (50 total)
    │   └── index.js                   ← Model associations
    └── routes/                        ← 36 Express route files
        ├── auth.js                    ← Login, register, logout, refresh
        ├── users.js
        ├── doctors.js
        ├── appointments.js
        ├── files.js                   ← File upload/download (MinIO)
        ├── onboarding.js
        ├── ... (36 total)
        └── webhooks.js
```

---

## 6. Environment Configuration

### Backend `.env` (`/opt/ecohealth/backend/.env`)
```env
PORT=3000
NODE_ENV=production

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ecohealth
DB_USER=sehat
DB_PASSWORD=<secure-password>

# Security
JWT_SECRET=<64-char-random-hex>
FILE_DOWNLOAD_SECRET=<64-char-random-hex>

# CORS
CORS_ORIGIN=https://afridiwins.online

# Admin seed
ADMIN_EMAIL=admin@ecohealth.local
ADMIN_PASSWORD=cLKArLVZF6f0dO8dny7MGoMB

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=sehat_minio_admin
MINIO_SECRET_KEY=<secure-password>
MINIO_BUCKET=ecohealth-uploads
MINIO_PUBLIC_BASE_URL=https://afridiwins.online/files
```

### Frontend `.env.production` (`/opt/ecohealth/.env.production`)
```env
VITE_API_BASE_URL=https://afridiwins.online/api
```

### View/Edit .env on VPS
```bash
cat /opt/ecohealth/backend/.env       # View
nano /opt/ecohealth/backend/.env      # Edit
```

---

## 7. Database Details

| Detail | Value |
|--------|-------|
| **Host** | `localhost` |
| **Port** | `5432` |
| **Database** | `ecohealth` |
| **User** | `sehat` |
| **Tables** | 50 tables |

### Access PostgreSQL
```bash
# As postgres superuser
sudo -u postgres psql -d ecohealth

# As sehat user
psql -U sehat -d ecohealth -h localhost
```

### List All Tables
```bash
sudo -u postgres psql -d ecohealth -c '\dt'
```

### Count Users
```bash
sudo -u postgres psql -d ecohealth -c "SELECT count(*) FROM users;"
```

### Database Tables (50 total)
```
appointments, audit_events, call_participants, call_rooms,
consent_events, consent_scopes, consents, conversation_members,
conversations, country_configs, delegations, devices,
discontinuations, doctor_credentials, doctors, dose_events,
emergency_contacts, encounters, health_card_shares, health_card_tokens,
health_cards, household_audit_events, household_consents,
household_invitations, household_members, households, invoices,
ips_documents, ips_source_records, medical_records, medication_plans,
messages, mfa_factors, notifications, organizations, payment_methods,
payments, payout_accounts, prescription_items, prescriptions,
record_import_files, record_import_versions, record_imports, refunds,
reviews, schedules, sessions, tracking_configs, uploaded_files, users
```

---

## 8. MinIO Object Storage

| Detail | Value |
|--------|-------|
| **Server** | `localhost:9000` |
| **Console** | `localhost:9001` |
| **Access Key** | `sehat_minio_admin` |
| **Bucket** | `ecohealth-uploads` |
| **Data Path** | `/data/minio` |
| **Systemd Service** | `minio.service` |

### MinIO Commands
```bash
mc alias set local http://127.0.0.1:9000 sehat_minio_admin '<password>'
mc ls local/ecohealth-uploads/                    # List files
mc mb local/new-bucket                        # Create bucket
mc rm local/ecohealth-uploads/filename.txt        # Delete file
systemctl status minio                         # Check service
systemctl restart minio                        # Restart
```

---

## 9. API Endpoints

All endpoints are available at both `/api/` and `/api/v1/` prefixes.

### Authentication (`/api/auth/`)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/login` | Login with email + password | No |
| POST | `/api/auth/register` | Register new user | No |
| GET | `/api/auth/me` | Get current user profile | Yes |
| PUT | `/api/auth/me` | Update current user profile | Yes |
| POST | `/api/auth/logout` | Logout (revokes session) | Yes |
| POST | `/api/auth/refresh` | Refresh JWT token | Yes |

### Core Resources
| Endpoint | Description |
|----------|-------------|
| `/api/users` | User management |
| `/api/doctors` | Doctor profiles |
| `/api/appointments` | Appointment booking |
| `/api/medical-records` | Patient medical records |
| `/api/prescriptions` | Prescriptions |
| `/api/encounters` | Consultation encounters |
| `/api/onboarding` | User onboarding flow |
| `/api/files` | File upload/download (MinIO) |
| `/api/health-cards` | Health cards |
| `/api/health-card-tokens` | Health card access tokens |
| `/api/households` | Household management |
| `/api/household-members` | Household members |
| `/api/delegations` | Access delegations |
| `/api/consents` | Consent management |
| `/api/notifications` | User notifications |
| `/api/payments` | Payment processing |
| `/api/reviews` | Doctor reviews |
| `/api/schedules` | Doctor schedules |
| `/api/ips` | International Patient Summary |
| `/api/record-imports` | Medical record imports |
| `/api/timeline` | Patient timeline |
| `/api/calls` | Video/voice calls |
| `/api/chat` | Chat conversations |
| `/api/conversation-members` | Chat members |
| `/api/medication-plans` | Medication plans |
| `/api/dose-events` | Dose tracking |
| `/api/discontinuations` | Medication discontinuations |
| `/api/emergency-contacts` | Emergency contacts |
| `/api/tracking-config` | Tracking configuration |
| `/api/country-configs` | Country-specific configs |
| `/api/audit` | Audit events |
| `/api/webhooks` | Webhook endpoints |

### Patient-scoped endpoints
| Endpoint | Description |
|----------|-------------|
| `/api/patients/:patientId/timeline` | Patient timeline |
| `/api/patients/:patientId/record-imports` | Patient record imports |
| `/api/patients/:patientId/ips` | Patient IPS |
| `/api/patients/:patientId/health-cards` | Patient health cards |
| `/api/appointments/:appointmentId/encounter` | Appointment encounter |

### Health Check
```bash
curl https://afridiwins.online/health
# Returns: {"status":"ok","database":"connected","database_type":"PostgreSQL"}
```

---

## 10. User Roles

| Role | Value | Category |
|------|-------|----------|
| Patient | `patient` | End User |
| Head of Household | `head_of_household` | End User |
| Doctor | `doctor` | End User / Clinical |
| Caregiver | `caregiver` | End User / Clinical |
| Clinic Admin | `clinic_admin` | Admin |
| Support Agent | `support_agent` | Admin |
| Compliance Auditor | `compliance_auditor` | Admin |
| Super Admin | `super_admin` | Admin |

---

## 11. PM2 Process Management

### Commands
```bash
pm2 status                              # Check process status
pm2 logs ecohealth-backend          # View live logs
pm2 logs ecohealth-backend --lines 50  # View last 50 lines
pm2 restart ecohealth-backend       # Restart backend
pm2 stop ecohealth-backend          # Stop backend
pm2 start ecohealth-backend         # Start backend
pm2 delete ecohealth-backend        # Remove from PM2
pm2 monit                               # Real-time monitor
pm2 flush                               # Clear logs
```

### Log Files
```bash
/opt/ecohealth/backend/logs/out.log     # Standard output
/opt/ecohealth/backend/logs/error.log   # Errors
```

### PM2 Startup (auto-restart on reboot)
```bash
pm2 startup systemd -u root --hp /root
pm2 save
```

---

## 12. Nginx Configuration

### Config File
```bash
/etc/nginx/sites-available/ecohealth    # Main config
/etc/nginx/sites-enabled/ecohealth      # Symlink (active)
```

### Commands
```bash
nginx -t                                   # Test config
systemctl reload nginx                     # Reload after changes
systemctl restart nginx                    # Full restart
systemctl status nginx                     # Check status
tail -f /var/log/nginx/ecohealth-access.log  # Access log
tail -f /var/log/nginx/ecohealth-error.log   # Error log
```

### What Nginx Does
- Serves frontend from `/opt/ecohealth/dist/`
- Proxies `/api/` to `http://127.0.0.1:3000` (Node.js backend)
- Proxies `/health` to `http://127.0.0.1:3000/health`
- SSL termination with Let's Encrypt
- HTTP → HTTPS redirect
- Gzip compression
- Static asset caching (1 year)

---

## 13. SSL Certificate

| Detail | Value |
|--------|-------|
| **Authority** | Let's Encrypt |
| **Domains** | `afridiwins.online`, `www.afridiwins.online` |
| **Expires** | 2026-11-07 |
| **Auto-renew** | Yes (certbot timer) |
| **Cert path** | `/etc/letsencrypt/live/afridiwins.online/fullchain.pem` |
| **Key path** | `/etc/letsencrypt/live/afridiwins.online/privkey.pem` |

### Commands
```bash
certbot certificates                       # View cert details
certbot renew                              # Manual renew
certbot --nginx -d afridiwins.online       # Re-issue
```

---

## 14. Firewall (UFW)

### Current Rules
| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | SSH |
| 80 | TCP | HTTP (redirects to HTTPS) |
| 443 | TCP | HTTPS |
| 5060 | UDP | FreeSWITCH SIP |
| 5080 | UDP | FreeSWITCH SIP |
| 8021 | TCP | FreeSWITCH FTP |
| 8088 | TCP | FreeSWITCH WS |
| 16384:32768 | UDP | FreeSWITCH RTP |

### Commands
```bash
ufw status                                 # View rules
ufw allow 443/tcp                          # Add rule
ufw deny 3306/tcp                          # Block port
ufw reload                                 # Reload
```

---

## 15. GitHub Repository

| Detail | Value |
|--------|-------|
| **URL** | https://github.com/talhakhancom1-cmyk/ecohealth |
| **Branch** | `main` |
| **Access** | Private (SSH deploy key on VPS) |

### Clone
```bash
git clone git@github.com:talhakhancom1-cmyk/ecohealth.git
```

---

## 16. Common Operations

### Restart Backend After Code Changes
```bash
pm2 restart ecohealth-backend
```

### Rebuild Frontend After Changes
```bash
cd /opt/ecohealth
npm ci                          # Install deps (if node_modules exists)
npm run build                   # Build to dist/
# Nginx serves dist/ automatically — no restart needed
```

### Update Backend Code
```bash
# Option 1: Direct edit
nano /opt/ecohealth/backend/server.js
pm2 restart ecohealth-backend

# Option 2: From git (requires re-clone since .git was removed)
cd /tmp
git clone git@github.com:talhakhancom1-cmyk/ecohealth.git
cp -r ecohealth/backend/* /opt/ecohealth/backend/
cp ecohealth/dist/* /opt/ecohealth/dist/ -r
pm2 restart ecohealth-backend
```

### View Backend Logs
```bash
pm2 logs ecohealth-backend --lines 100
```

### Check Database Connection
```bash
sudo -u postgres psql -d ecohealth -c "SELECT 1;"
```

### Check All Services
```bash
systemctl status nginx
systemctl status postgresql
systemctl status minio
pm2 status
```

### Change Admin Password
```bash
# Update .env
nano /opt/ecohealth/backend/.env
# Change ADMIN_PASSWORD value

# Or directly in database
sudo -u postgres psql -d ecohealth
# Generate hash first:
# node -e "console.log(require('bcryptjs').hashSync('newpassword', 12))"
# Then:
# UPDATE users SET password_hash='<hash>' WHERE email='admin@ecohealth.local';
```

---

## 17. Security Notes

- **JWT Secret**: 64-char random hex in `.env` — never share
- **File Download Secret**: 64-char random hex — used for file access tokens
- **DB Password**: Strong password on `sehat` PostgreSQL user
- **MinIO Credentials**: Custom access key + strong password
- **CORS**: Locked to `https://afridiwins.online` only
- **Helmet**: Security headers enabled (X-Frame-Options, HSTS, etc.)
- **Rate Limiting**: 100 req/15min on auth, 200 req/min on all API
- **SSL**: Let's Encrypt with auto-renewal
- **Firewall**: Only SSH, HTTP, HTTPS open to public
- **MinIO**: Bound to `127.0.0.1` — not accessible from outside

---

## 18. Troubleshooting

### Backend won't start
```bash
pm2 logs ecohealth-backend --lines 50
# Check for missing .env, DB connection, port conflicts
```

### Frontend shows "Failed to fetch"
- Check if backend is running: `pm2 status`
- Check health: `curl https://afridiwins.online/health`
- Check if `.env.production` has correct `VITE_API_BASE_URL`
- Rebuild frontend if domain changed

### Database connection failed
```bash
systemctl status postgresql
sudo -u postgres psql -d ecohealth -c "SELECT 1;"
# Check .env DB credentials
```

### MinIO upload failed
```bash
systemctl status minio
curl http://127.0.0.1:9000/minio/health/live
# Check .env MINIO credentials
mc ls local/ecohealth-uploads/
```

### SSL certificate expired
```bash
certbot renew --nginx
systemctl reload nginx
```

### "Too many requests" error
- Auth rate limit: 100 requests per 15 minutes per IP
- General rate limit: 200 requests per minute per IP
- Wait 15 minutes or restart backend: `pm2 restart ecohealth-backend`
