# Sehat Connect — Developer Notes
**Production Server:** `ehcserver.webfrat.com`  
**Repository:** `github.com/talhakhancom1-cmyk/sehat-connect`  
**Last Updated:** August 9, 2026

---

## Table of Contents
1. [Server Infrastructure](#1-server-infrastructure)
2. [Stack & Technologies](#2-stack--technologies)
3. [Database Models (40+)](#3-database-models)
4. [API Endpoints (Complete Reference)](#4-api-endpoints)
5. [Frontend Routes & Pages](#5-frontend-routes)
6. [Real-Time WebSocket Events](#6-real-time-websocket-events)
7. [Background Jobs (Scheduler)](#7-background-jobs)
8. [Email/SMTP System](#8-emailsmtp-system)
9. [Notification Delivery](#9-notification-delivery)
10. [API Key System](#10-api-key-system)
11. [Authentication & Security](#11-authentication--security)
12. [Admin Panel Features](#12-admin-panel-features)
13. [Environment Variables](#13-environment-variables)
14. [Server Commands](#14-server-commands)
15. [Known Security Issues (Pending Fix)](#15-known-security-issues)
16. [Future Work / TODO](#16-future-work--todo)

---

## 1. Server Infrastructure

### Production Server: `ehcserver.webfrat.com`

| Service | Port | Managed By | Status |
|---------|------|------------|--------|
| Nginx (reverse proxy) | 80, 443 | systemd | Active |
| Backend API (Node.js) | 3000 | PM2 | Online |
| PostgreSQL 18 | 5432 | systemd | Active |
| MinIO (S3 storage) | 9000 | systemd | Active |
| Redis | 6379 | systemd | Active |
| WebSocket (/ws) | — | Nginx → PM2 | Active |

### File Locations
```
/opt/sehat-connect/
├── dist/              ← Built frontend (Vite, served by Nginx)
└── backend/           ← Backend API (Node.js + Express)
    ├── config/        ← Database + MinIO config
    ├── constants/     ← EHC constants
    ├── lib/           ← Library modules (realtime, scheduler, email, etc.)
    ├── middleware/    ← Auth + API key middleware
    ├── models/        ← Sequelize models (40+ tables)
    ├── routes/        ← Express routes (35+ route files)
    ├── logs/          ← PM2 logs
    ├── .env           ← Environment variables (secrets)
    ├── server.js      ← Main entry point
    └── ecosystem.config.js ← PM2 config
```

### Nginx Config
- Located at `/etc/nginx/sites-available/sehat-connect`
- HTTP → HTTPS redirect
- SSL via Let's Encrypt (certbot)
- `/api/` → proxies to `localhost:3000`
- `/ws/` → proxies to `localhost:3000` (WebSocket upgrade)
- `/health` → proxies to `localhost:3000/health`
- Static files from `/opt/sehat-connect/dist/`
- SPA fallback: `try_files $uri $uri/ /index.html`
- Max upload: 30MB
- Gzip enabled

---

## 2. Stack & Technologies

### Backend
- **Runtime:** Node.js 22
- **Framework:** Express.js
- **ORM:** Sequelize (PostgreSQL dialect)
- **Database:** PostgreSQL 18
- **Real-time:** Socket.IO
- **Scheduler:** node-cron
- **Email:** nodemailer
- **Process Manager:** PM2
- **Auth:** JWT (jsonwebtoken) + bcryptjs

### Frontend
- **Framework:** React 18
- **Build:** Vite 6
- **Styling:** Tailwind CSS + shadcn/ui components
- **Charts:** Recharts
- **Icons:** lucide-react
- **Dates:** moment.js + date-fns
- **State:** React Context (AuthContext)
- **API Client:** Custom API client (fetch-based)

### Infrastructure
- **Object Storage:** MinIO (S3-compatible)
- **Cache:** Redis
- **Reverse Proxy:** Nginx
- **SSL:** Let's Encrypt (certbot)
- **Firewall:** UFW (recommended)

---

## 3. Database Models

### Core Identity (10 models)
| Model | Description |
|-------|-------------|
| User | User accounts with EHC roles (patient, doctor, admin, etc.) |
| Doctor | Doctor profiles (specialty, verification, ratings) |
| Device | User devices for push notifications (FCM tokens) |
| Session | User sessions (JWT jti tracking) |
| PasswordReset | Password reset tokens (1-hour expiry) |
| ApiKey | API keys with domain allowlisting + scopes |
| EmailConfig | SMTP configuration (admin-managed) |
| MfaFactor | Multi-factor authentication factors |
| DoctorCredential | Doctor verification credentials |
| Organization | Healthcare organizations |

### Clinical (8 models)
| Model | Description |
|-------|-------------|
| Appointment | Patient-doctor appointments |
| MedicalRecord | Patient medical records |
| Prescription | Prescriptions with items |
| PrescriptionItem | Individual prescription drugs |
| Encounter | Clinical encounter notes |
| MedicationPlan | Medication schedules |
| DoseEvent | Medication dose tracking |
| Discontinuation | Medication discontinuation records |

### Consent & Access (4 models)
| Model | Description |
|-------|-------------|
| Consent | Data sharing consent records |
| ConsentScope | Scope of shared data |
| ConsentEvent | Consent grant/revoke events |
| Delegation | Data access delegations |

### Communication (5 models)
| Model | Description |
|-------|-------------|
| Conversation | Chat conversations |
| ConversationMember | Conversation participants |
| Message | Chat messages |
| CallRoom | Video/audio call rooms |
| CallParticipant | Call participants |

### Digital Health (6 models)
| Model | Description |
|-------|-------------|
| IPS | International Patient Summary (FHIR) |
| IPSSourceRecord | IPS source record references |
| HealthCard | Digital health cards |
| HealthCardShare | Health card sharing records |
| HealthCardToken | Health card access tokens (QR) |
| Review | Doctor reviews/ratings |

### Household (5 models)
| Model | Description |
|-------|-------------|
| Household | Household accounts |
| HouseholdMember | Household members |
| HouseholdInvitation | Member invitations |
| HouseholdConsent | Household-level consents |
| HouseholdAuditEvent | Household audit log |

### Payments (5 models)
| Model | Description |
|-------|-------------|
| Payment | Payment records |
| PaymentMethod | Saved payment methods |
| Invoice | Invoices |
| Refund | Refund records |
| PayoutAccount | Payout account details |

### Other (7 models)
| Model | Description |
|-------|-------------|
| Schedule | Doctor availability schedules |
| EmergencyContact | Emergency contact records |
| Notification | User notifications (multi-channel) |
| TrackingConfig | Analytics/tracking pixel config |
| CountryConfig | Country-specific settings |
| AuditEvent | System audit log |
| UploadedFile | File upload metadata |

### Record Import (3 models)
| Model | Description |
|-------|-------------|
| RecordImport | Import batch records |
| RecordImportFile | Individual import files |
| RecordImportVersion | Import version history |

---

## 4. API Endpoints

All endpoints are prefixed with `/api` (also available at `/api/v1`).

### Authentication (`/api/auth`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/auth/login` | Login with email + password | No |
| POST | `/auth/register` | Register new user | No |
| GET | `/auth/me` | Get current user profile | Yes |
| PUT | `/auth/me` | Update profile | Yes |
| POST | `/auth/logout` | Logout (revoke session) | Yes |
| POST | `/auth/refresh` | Refresh JWT token | Yes |
| POST | `/auth/forgot-password` | Request password reset | No |
| POST | `/auth/reset-password` | Reset password with token | No |
| POST | `/auth/change-password` | Change password (authenticated) | Yes |
| POST | `/auth/verify-reset-token` | Verify reset token validity | No |

### Appointments (`/api/appointments`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List appointments (patient/doctor scoped) |
| GET | `/:id` | Get appointment by ID |
| POST | `/` | Create appointment |
| PUT | `/:id` | Update appointment |
| DELETE | `/:id` | Delete appointment |

### Doctors (`/api/doctors`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/suggest?q=` | Autocomplete search (ILIKE) |
| GET | `/?q=&specialty=&city=` | List/search doctors with filters |
| GET | `/:id` | Get doctor by ID |
| POST | `/` | Create doctor (admin) |
| PUT | `/:id` | Update doctor |
| DELETE | `/:id` | Delete doctor (admin) |

### Medical Records (`/api/medical-records`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List medical records |
| GET | `/:id` | Get record by ID |
| POST | `/` | Create medical record |
| PUT | `/:id` | Update record (admin) |
| DELETE | `/:id` | Delete record (admin) |

### Chat (`/api/conversations`, `/api/messages`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/conversations` | List conversations |
| POST | `/conversations` | Create conversation |
| GET | `/conversations/:id` | Get conversation |
| GET | `/conversations/:id/messages` | Get messages (paginated) |
| POST | `/conversations/:id/messages` | Send message |
| POST | `/conversations/:id/messages/:msgId/read` | Mark as read |
| GET | `/messages` | List all messages |
| POST | `/messages` | Create message |
| PUT | `/messages/:id` | Update message |
| DELETE | `/messages/:id` | Delete message |

### Calls (`/api/calls`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create call room |
| GET | `/:callId` | Get call room |
| PUT | `/:callId` | Update call state |
| POST | `/:callId/participants` | Add participant |
| DELETE | `/:callId/participants/:userId` | Remove participant |

### Notifications (`/api/notifications`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List notifications (paginated) |
| POST | `/` | Create + dispatch notification |
| POST | `/register-device` | Register FCM push token |
| DELETE | `/unregister-device` | Remove push token |
| PUT | `/:id` | Update notification |
| DELETE | `/:id` | Delete notification |
| POST | `/mark-all-read` | Mark all as read |

### Files (`/api/files`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/upload` | Upload file (25MB max, Multer) |
| GET | `/:id/download` | Download file (signed token) |
| DELETE | `/:id` | Delete file |

### Health Cards (`/api/health-cards`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List health cards |
| POST | `/` | Create health card |
| GET | `/:id` | Get health card |
| PUT | `/:id` | Update health card |
| DELETE | `/:id` | Delete health card |

### Health Card Tokens (`/api/health-card-tokens`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List tokens |
| POST | `/` | Create token (for QR sharing) |
| DELETE | `/:id` | Revoke token |

### Consents (`/api/consents`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List consents |
| POST | `/` | Grant consent |
| GET | `/:id` | Get consent |
| PUT | `/:id` | Update consent |
| DELETE | `/:id` | Revoke consent |

### Delegations (`/api/delegations`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List delegations |
| POST | `/` | Create delegation |
| PUT | `/:id` | Update delegation |
| DELETE | `/:id` | Revoke delegation |

### Prescriptions (`/api/prescriptions`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List prescriptions |
| POST | `/` | Create prescription |
| GET | `/:id` | Get prescription |

### Encounters (`/api/encounters`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List encounters |
| POST | `/` | Create encounter |
| PUT | `/:id` | Update encounter |

### Payments (`/api/payments`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/intent` | Create payment intent |
| POST | `/:id/capture` | Capture payment |
| POST | `/:id/refund` | Refund payment |
| GET | `/` | List payments |

### Households (`/api/households`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List households |
| POST | `/` | Create household |
| GET | `/:id` | Get household |
| PUT | `/:id` | Update household |
| DELETE | `/:id` | Delete household |
| POST | `/:id/invite` | Invite member |
| POST | `/:id/accept-invitation` | Accept invitation |

### Medication Plans (`/api/medication-plans`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List medication plans |
| POST | `/` | Create medication plan |
| GET | `/:id` | Get medication plan |
| PUT | `/:id` | Update medication plan |
| DELETE | `/:id` | Delete medication plan |

### Dose Events (`/api/dose-events`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List dose events |
| POST | `/` | Log dose event |
| PUT | `/:id` | Update dose event |
| DELETE | `/:id` | Delete dose event |

### Schedules (`/api/schedules`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List schedules |
| POST | `/` | Create schedule |
| GET | `/:id` | Get schedule |
| PUT | `/:id` | Update schedule |
| DELETE | `/:id` | Delete schedule |

### Reviews (`/api/reviews`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List reviews |
| POST | `/` | Create review |
| GET | `/:id` | Get review |

### Emergency Contacts (`/api/emergency-contacts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List contacts |
| POST | `/` | Create contact |
| PUT | `/:id` | Update contact |
| DELETE | `/:id` | Delete contact |

### API Keys (`/api/api-keys`) — Admin only
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all API keys |
| GET | `/:id` | Get API key by ID |
| POST | `/` | Create API key (returns full key once) |
| PUT | `/:id` | Update key (domains, scopes, active) |
| POST | `/:id/rotate` | Generate new key string |
| DELETE | `/:id` | Delete API key |

### Email Config (`/api/email-config`) — Admin only
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get SMTP config (password masked) |
| POST | `/` | Create/update SMTP config |
| POST | `/test` | Send test email |
| DELETE | `/` | Deactivate email config |

### Audit (`/api/audit-events`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List audit events (admin) |
| POST | `/` | Create audit event |

### Country Config (`/api/country-configs`) — Admin only
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List country configs |
| POST | `/` | Create config |
| GET | `/:id` | Get config |
| PUT | `/:id` | Update config |
| DELETE | `/:id` | Delete config |

### Tracking Config (`/api/tracking-config`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get tracking pixels (public) |
| POST | `/` | Create config (admin) |
| PUT | `/:id` | Update config (admin) |
| DELETE | `/:id` | Delete config (admin) |

### IPS (`/api/ips`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Generate IPS document |
| GET | `/` | List IPS documents |
| GET | `/:id` | Get IPS document |

### Record Imports (`/api/record-imports`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create record import |
| GET | `/` | List record imports |
| GET | `/:id` | Get record import |
| POST | `/:id/submit` | Submit for verification |
| POST | `/:id/verify` | Verify import |

### Timeline (`/api/patients/:patientId/timeline`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get patient timeline |

### Onboarding (`/api/onboarding`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Complete onboarding |

### Webhooks (`/api/webhooks`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/stripe` | Stripe webhook handler |
| POST | `/paypal` | PayPal webhook handler |

### Custom Functions (`/api/functions`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/getFamilySharedData` | Get family shared records + health cards |

### Health Check
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server health + database status |

---

## 5. Frontend Routes

### Public (no auth)
| Path | Page | Description |
|------|------|-------------|
| `/login` | Login.jsx | Login form |
| `/register` | Register.jsx | Registration form |
| `/forgot-password` | ForgotPassword.jsx | Request reset link |
| `/reset-password` | ResetPassword.jsx | Reset with token |
| `/onboarding` | Onboarding.jsx | User onboarding flow |

### Patient Portal
| Path | Page | Description |
|------|------|-------------|
| `/` | Home.jsx | Dashboard (upcoming appts, records) |
| `/doctors` | FindDoctors.jsx | Search + filter doctors |
| `/doctors/:id` | DoctorProfile.jsx | Doctor profile + booking |
| `/appointments` | Appointments.jsx | Appointment list + tabs |
| `/records` | MedicalRecords.jsx | Medical records list |
| `/timeline` | RecordTimelinePage.jsx | Record timeline view |
| `/records/import` | ImportRecord.jsx | Import external records |
| `/prescriptions` | Prescriptions.jsx | Prescription list |
| `/medications` | Medications.jsx | Medication plans + dose logger |
| `/emergency` | Emergency.jsx | Emergency contacts + hospitals |
| `/history` | ConsultationHistory.jsx | Past consultations |
| `/chat` | Chat.jsx | Conversation list |
| `/chat/:id` | ChatThread.jsx | Chat messages + calls |
| `/notifications` | NotificationsPage.jsx | Notification list |
| `/access` | ManageAccess.jsx | Consents + delegations |
| `/cards` | HealthCards.jsx | Health cards + QR tokens |
| `/household` | Household.jsx | Household management |

### Doctor Portal
| Path | Page | Description |
|------|------|-------------|
| `/doctor` | DoctorDashboard.jsx | Stats + today's appts |
| `/doctor/appointments` | DoctorAppointments.jsx | Appointment management |
| `/doctor/patients` | DoctorPatients.jsx | Patient list |
| `/doctor/prescriptions` | DoctorPrescriptions.jsx | Write prescriptions |
| `/doctor/encounters` | DoctorEncounters.jsx | Clinical encounters |
| `/doctor/schedule` | DoctorSchedule.jsx | Set availability |
| `/doctor/calendar` | DoctorCalendar.jsx | Calendar view |
| `/doctor/verification` | DoctorVerification.jsx | Verification status |
| `/doctor/verify-card` | VerifyCard.jsx | Verify patient health card |

### Admin Portal
| Path | Page | Description |
|------|------|-------------|
| `/admin` | AdminDashboard.jsx | Stats + charts |
| `/admin/doctors` | AdminDoctors.jsx | Doctor management |
| `/admin/users` | AdminUsers.jsx | User management |
| `/admin/audit` | AdminAuditLog.jsx | Audit log viewer |
| `/admin/config` | AdminCountryConfig.jsx | Country configuration |
| `/admin/pixels` | AdminPixels.jsx | Tracking pixel config |
| `/admin/api-keys` | AdminApiKeys.jsx | API key management |
| `/admin/email` | AdminEmailConfig.jsx | SMTP/Email configuration |

---

## 6. Real-Time WebSocket Events

**Endpoint:** `wss://ehcserver.webfrat.com/ws`  
**Auth:** JWT token in `auth` event on connection

### Client → Server Events
| Event | Payload | Description |
|-------|---------|-------------|
| `auth` | `{ token }` | Authenticate connection |
| `conversation:join` | `{ conversationId }` | Join conversation room |
| `conversation:leave` | `{ conversationId }` | Leave conversation room |
| `typing:start` | `{ conversationId }` | Typing indicator start |
| `typing:stop` | `{ conversationId }` | Typing indicator stop |
| `message:read` | `{ messageId }` | Mark message as read |
| `call:offer` | `{ callId, targetUserId, sdp }` | WebRTC call offer |
| `call:answer` | `{ callId, sdp }` | WebRTC call answer |
| `call:ice` | `{ callId, candidate }` | ICE candidate exchange |
| `call:end` | `{ callId }` | End call |

### Server → Client Events
| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `{ message }` | New message in conversation |
| `message:updated` | `{ message }` | Message updated |
| `typing:update` | `{ conversationId, userId, typing }` | Typing status |
| `call:incoming` | `{ callId, caller, type }` | Incoming call |
| `call:state` | `{ callId, state }` | Call state change |
| `call:ended` | `{ callId, reason }` | Call ended |
| `presence:update` | `{ userId, online }` | User online/offline |
| `notification:new` | `{ notification }` | New notification |

---

## 7. Background Jobs (Scheduler)

**File:** `backend/lib/scheduler.js`  
**Library:** node-cron  
**Started on:** Server boot

| Job | Schedule | Description |
|-----|----------|-------------|
| Appointment reminders (24h) | Every 15 min | Send reminder 24h before appointment |
| Appointment reminders (1h) | Every 15 min | Send reminder 1h before appointment |
| Medication dose reminders | Every 15 min | Send reminder 30min before scheduled dose |
| Consent expiry check | Every hour | Process expired consents |
| Health card token cleanup | Every hour | Remove expired tokens |
| Session cleanup | Daily 3:00 AM | Remove expired/revoked sessions |
| Notification retry | Every 5 min | Retry pending notification deliveries |

---

## 8. Email/SMTP System

**File:** `backend/lib/emailService.js`  
**Library:** nodemailer  
**Config:** Stored in `email_configs` table (admin panel)

### Email Types (with feature toggles)
| Type | Feature Flag | Template |
|------|-------------|----------|
| Password reset | `enable_password_reset` | HTML with reset button link |
| Signup OTP | `enable_signup_otp` | HTML with 6-digit OTP code |
| Appointment reminder | `enable_appointment_reminders` | HTML with doctor/date/time |
| Medication reminder | `enable_medication_reminders` | HTML with medication name/time |
| Payment receipt | `enable_payment_receipts` | HTML with invoice/amount |
| Consent notification | `enable_consent_notifications` | Via notification dispatcher |
| Chat notification | `enable_chat_notifications` | Via notification dispatcher |

### Provider Presets (in admin panel)
- Gmail (smtp.gmail.com:587)
- Outlook (smtp.office365.com:587)
- SendGrid (smtp.sendgrid.net:587)
- Mailgun (smtp.mailgun.org:587)
- Amazon SES (email-smtp.us-east-1.amazonaws.com:587)
- Zoho, Yahoo

### How it works
1. Admin configures SMTP in `/admin/email`
2. Settings stored in `email_configs` table
3. `emailService.js` creates nodemailer transporter on first use
4. Transporter is cached and reused
5. When config is updated, transporter is invalidated
6. Feature flags control which email types are sent
7. If email not configured, password reset returns token in API response (dev fallback)

---

## 9. Notification Delivery

**File:** `backend/lib/notificationDispatcher.js`

### Channels (in priority order)
1. **In-app** — Via Socket.IO real-time push
2. **Push (FCM)** — Firebase Cloud Messaging for mobile apps
3. **SMS (Twilio)** — For phone-based notifications
4. **Email (SMTP)** — Via configured email service

### Flow
1. Notification created via `POST /api/notifications`
2. Dispatcher processes it immediately
3. Tries each channel based on availability
4. Records `delivered_at` and `delivery_channel`
5. Failed deliveries retried by scheduler every 5 min

### Device Registration
- `POST /api/notifications/register-device` — Register FCM token
- `DELETE /api/notifications/unregister-device` — Remove token

---

## 10. API Key System

**Files:** `backend/models/ApiKey.js`, `backend/middleware/apiKeyAuth.js`, `backend/routes/apiKeys.js`

### Features
- Admin creates keys with domain allowlisting
- Key stored as SHA-256 hash (never plaintext after creation)
- Key prefix shown for identification (e.g. `sk_live_a1b2c3...`)
- Domain verification: checks `Origin`/`Referer`/`Host` header
- Scope-based authorization (e.g. `read:doctors`)
- Rate limit per minute (configurable, not yet enforced)
- Usage tracking: `total_requests`, `last_used_at`, `last_used_ip`
- Key rotation (generates new key, invalidates old one)
- Expiry dates

### Authentication Methods
- `X-API-Key: sk_live_...` header
- `Authorization: ApiKey sk_live_...` header

### Admin Panel (`/admin/api-keys`)
- Create key with name, domains, scopes, rate limit, expiry
- View key list with status badges (Active/Inactive/Expired)
- Add/remove domains inline
- Activate/deactivate, rotate, delete keys
- Full key shown once on creation with copy button

---

## 11. Authentication & Security

### JWT Authentication
- **Token:** Signed with `JWT_SECRET` from env
- **TTL:** 7 days (configurable via `JWT_TTL`)
- **Payload:** `{ id, email, role, app_role, jti }`
- **Session tracking:** `jti` stored in Session table
- **Logout:** Revokes session by `jti`

### Role System (Canonical EHC Roles)
| Role | Description |
|------|-------------|
| `patient` | Default patient role |
| `head_of_household` | Household manager |
| `doctor` | Healthcare provider |
| `caregiver` | Caregiver with delegated access |
| `clinic_admin` | Clinic administrator |
| `support_agent` | Support staff |
| `compliance_auditor` | Compliance reviewer |
| `super_admin` | Full system access |

### Middleware
- `authenticate` — Verifies JWT, attaches `req.user`
- `requireRole(roles)` — Checks user has one of specified roles
- `requireAdmin()` — Requires admin-level role
- `authenticateApiKey(scope)` — Verifies API key + domain + scope

### Rate Limiting
- **Auth routes:** 100 requests / 15 minutes
- **General API:** 200 requests / minute
- **Webhooks:** No limiter (TODO)

### Security Headers (Helmet)
- X-Frame-Options: SAMEORIGIN
- X-Content-Type-Options: nosniff
- Strict-Transport-Security: max-age=31536000
- Referrer-Policy: strict-origin-when-cross-origin

### CORS
- Configured via `CORS_ORIGIN` env var
- Comma-separated list of allowed origins

---

## 12. Admin Panel Features

### Dashboard (`/admin`)
- Total doctors, patients, appointments, revenue
- Pending doctor verifications
- 7-day appointment chart
- Revenue by day chart

### Doctor Management (`/admin/doctors`)
- List all doctors with filters
- Verify/reject doctors
- Edit doctor profiles
- Delete doctors

### User Management (`/admin/users`)
- List all users with search
- Filter by role
- Edit user profiles
- Delete users

### Audit Log (`/admin/audit`)
- View all audit events
- Filter by action, user, date

### Country Config (`/admin/config`)
- Country-specific settings
- Currency, payment providers, locale

### Tracking Pixels (`/admin/pixels`)
- Configure analytics/tracking pixels
- Pixel injection on frontend

### API Keys (`/admin/api-keys`)
- Create/manage API keys with domain restrictions
- See usage statistics
- Rotate/delete keys

### Email/SMTP (`/admin/email`)
- Configure SMTP server
- Provider presets (Gmail, SendGrid, etc.)
- Per-feature email toggles
- Send test email
- Activate/deactivate

---

## 13. Environment Variables

### Backend (`/opt/sehat-connect/backend/.env`)

```bash
# Server
PORT=3000
NODE_ENV=production

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sehat_connect
DB_USER=sehat
DB_PASSWORD=<auto-generated>

# Security
JWT_SECRET=<auto-generated 96-char hex>
FILE_DOWNLOAD_SECRET=<auto-generated 96-char hex>

# CORS
CORS_ORIGIN=https://ehcserver.webfrat.com

# Admin seed
ADMIN_EMAIL=admin@ehcserver.webfrat.com
ADMIN_PASSWORD=<auto-generated>

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=<auto-generated>
MINIO_SECRET_KEY=<auto-generated>
MINIO_BUCKET=sehat-uploads
MINIO_PUBLIC_BASE_URL=https://ehcserver.webfrat.com/files

# Redis
REDIS_URL=redis://localhost:6379
```

### Frontend (generated at build time)
```bash
VITE_API_BASE_URL=https://ehcserver.webfrat.com/api
```

---

## 14. Server Commands

### PM2 (Backend)
```bash
pm2 status                          # Check status
pm2 logs sehat-connect-backend      # View logs (live)
pm2 logs sehat-connect-backend --lines 50  # Last 50 lines
pm2 restart sehat-connect-backend   # Restart backend
pm2 stop sehat-connect-backend      # Stop backend
pm2 delete sehat-connect-backend    # Delete from PM2
```

### Nginx
```bash
sudo nginx -t                       # Test config
sudo systemctl reload nginx         # Reload config
sudo systemctl restart nginx        # Restart
sudo systemctl status nginx         # Check status
```

### PostgreSQL
```bash
sudo -u postgres psql -d sehat_connect  # Connect to DB
sudo systemctl status postgresql        # Check status
sudo systemctl restart postgresql       # Restart
```

### MinIO
```bash
sudo systemctl status minio     # Check status
sudo systemctl restart minio    # Restart
mc ls local/sehat-uploads       # List files in bucket
```

### Redis
```bash
sudo systemctl status redis-server  # Check status
redis-cli ping                      # Test connection
```

### Health Checks
```bash
curl http://localhost:3000/health           # Direct backend
curl https://ehcserver.webfrat.com/health   # Via Nginx (HTTPS)
```

### Logs
```bash
# Backend logs
tail -f /opt/sehat-connect/backend/logs/out.log
tail -f /opt/sehat-connect/backend/logs/error.log

# Nginx logs
tail -f /var/log/nginx/sehat-connect-access.log
tail -f /var/log/nginx/sehat-connect-error.log
```

---

## 15. Known Security Issues

> **These were identified in a security audit and need to be fixed.**

### Critical
1. **Mass assignment** — `PUT /api/auth/me` allows changing `role` field. Fix: whitelist allowed fields.
2. **Password reset token exposed** in API response when email not configured. Fix: never return token.
3. **SMTP password stored in plaintext** in database. Fix: encrypt at rest with AES-256-GCM.
4. **JWT secret fallback** to hardcoded dev secret if env var missing. Fix: fail if not set.
5. **MinIO default credentials** fallback to `minioadmin:minioadmin`. Fix: fail if not set.
6. **Mass assignment** in multiple routes (users, doctors, appointments, chat). Fix: field whitelisting.

### High
7. Weak password policy (only 6 chars, no complexity). Fix: require 12+ chars with complexity.
8. CORS defaults to `*` if not set. Fix: fail in production if not configured.
9. No session revocation check in JWT middleware. Fix: check Session table on each request.
10. No account lockout for brute force. Fix: lock after 5 failed attempts.
11. No request body size limits. Fix: `express.json({ limit: '1mb' })`.
12. File upload validates MIME type only. Fix: check magic numbers.

### Medium
13. JWT TTL 7 days (too long for healthcare). Fix: reduce to 1h with refresh tokens.
14. No CSRF protection. Fix: add csurf middleware.
15. No security event logging. Fix: log failed logins, unauthorized access.
16. API key rate limiting not enforced. Fix: implement per-key rate limiting.
17. Error messages expose internal details. Fix: generic errors in production.

---

## 16. Future Work / TODO

### Pending Features
- [ ] Fix all critical security issues (see above)
- [ ] Implement real payment providers (JazzCash, EasyPaisa, Raast, Stripe, PayPal)
- [ ] Implement PDF generation for prescriptions and receipts
- [ ] Implement FCM push notifications (need Firebase project)
- [ ] Implement Twilio SMS notifications (need Twilio account)
- [ ] Implement real WebRTC video/audio calls (currently call state only)
- [ ] Add input validation with express-validator on all routes
- [ ] Add account lockout mechanism
- [ ] Add password history tracking
- [ ] Implement refresh token rotation
- [ ] Add CSRF protection
- [ ] Implement per-key API rate limiting with Redis
- [ ] Add file magic number validation
- [ ] Implement MFA (TOTP, SMS, email)
- [ ] Add International Patient Summary (IPS) FHIR export
- [ ] Add health card QR code verification
- [ ] Implement doctor credential verification workflow
- [ ] Add multi-language support (i18n)
- [ ] Add PWA offline support
- [ ] Implement data export (GDPR compliance)
- [ ] Add audit logging to all sensitive operations

### Performance
- [ ] Code-split frontend bundles (currently 1.7MB main bundle)
- [ ] Add Redis caching for frequently accessed data
- [ ] Implement database query optimization
- [ ] Add API response compression (brotli)
- [ ] Implement CDN for static assets

### Monitoring
- [ ] Add health monitoring (Uptime Kuma or similar)
- [ ] Add error tracking (Sentry)
- [ ] Add performance monitoring (New Relic / PM2 Plus)
- [ ] Add log aggregation (ELK stack or similar)
- [ ] Set up automated database backups
- [ ] Set up automated SSL renewal monitoring

---

## Quick Reference

### Default Admin Login
```
URL: https://ehcserver.webfrat.com/login
Email: admin@ehcserver.webfrat.com
Password: <check backend/.env ADMIN_PASSWORD>
```

### API Base URL
```
https://ehcserver.webfrat.com/api
```

### WebSocket URL
```
wss://ehcserver.webfrat.com/ws
```

### Health Check
```
GET https://ehcserver.webfrat.com/health
→ {"status":"ok","database":"connected"}
```

### WebSocket Event Contract
```
GET https://ehcserver.webfrat.com/api/ws/contract
```
