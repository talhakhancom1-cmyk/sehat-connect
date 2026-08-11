# AGENTS.md

## Project Context

EcoHealth Cloud is a global, patient-owned healthcare operating platform. This repository contains the **Website / PWA client** and the **shared backend**. Per the Engineering Bible, all four clients (Website, Windows, iOS, Android) present the same backend and the same PostgreSQL database through the same API — there is one backend, one database, and multiple presentation layers.

The project runs as a standalone Vite frontend + Express/Sequelize backend.

## Architecture

- **Frontend**: React 18 + Vite, installable as a PWA.
- **Backend**: Node.js + Express + Sequelize ORM.
- **Database**: PostgreSQL 18 (single logical database).
- **Object storage**: MinIO (S3-compatible) for file uploads.
- **Realtime / Chat**: scaffolded via REST (WebSocket/Socket.IO to follow).
- **Storage / Payments / Calls**: intentionally abstracted so each can be wired to country-specific providers.
- **Security**: Helmet, rate limiting, JWT auth, bcrypt, session revocation, audit logging.

## Repository Structure

```
ecohealth/
├── frontend/          # React + Vite PWA client
│   ├── src/           # Frontend source code
│   ├── public/        # Static assets
│   ├── index.html     # Vite entry point
│   ├── vite.config.js # Vite config with path aliases
│   ├── package.json   # Frontend dependencies
│   └── .env.local     # Frontend dev env vars
├── backend/           # Node.js + Express + Sequelize API
│   ├── server.js      # Express server, database sync, admin seeding
│   ├── models/        # Sequelize models
│   ├── routes/        # Express route handlers
│   ├── lib/           # Shared libraries (auth, realtime, scheduler, etc.)
│   ├── config/        # Database and MinIO config
│   ├── middleware/    # Auth and validation middleware
│   ├── ecosystem.config.js  # PM2 process config
│   └── env.example    # Backend env template
├── webrtc/            # Documentation for WebRTC/signaling components
│   └── README.md      # Architecture and key file reference
├── deploy/            # Deployment scripts and env templates
│   ├── deploy-app-server.sh
│   ├── deploy-signaling-server.sh
│   ├── setup-app-server.sh
│   ├── setup-signaling-server.sh
│   ├── env.app-server.example
│   └── env.signaling-server.example
├── DEPLOYMENT.md      # Full deployment guide
├── AGENTS.md          # This file
└── package.json       # Root workspace config
```

## Key Files

- `frontend/src/`: web application source.
- `backend/`: shared backend source.
- `backend/models/User.js`: canonical EHC role model (Section 4).
- `backend/server.js`: Express server, database sync, admin seeding.
- `backend/config/database.js`: PostgreSQL connection.
- `backend/config/minio.js`: MinIO (S3) client for file storage.
- `backend/middleware/auth.js`: JWT authentication + role checks.
- `backend/lib/parseSort.js`: shared sort parameter parser.
- `frontend/src/lib/useRole.js`: frontend role helpers using the canonical EHC roles.
- `frontend/src/api/base44Client.js`: frontend API client that routes to the backend.
- `frontend/vite.config.js`: Vite config with path aliases.
- `frontend/.env.local`: frontend dev env vars.
- `frontend/.env.production`: frontend prod env vars (VITE_API_BASE_URL).
- `backend/env.example`: backend env template.
- `backend/ecosystem.config.js`: PM2 process config.
- `deploy/`: deployment scripts and env templates.

## Working Notes

- Use `npm run dev:both` (from `frontend/`) to start the Vite frontend and Express backend together.
- Backend-only work: `cd backend && npm run dev` (nodemon) or `node server.js`.
- Frontend-only work: `cd frontend && npm run dev`.
- The API base is `/api` (relative, proxied by Vite in dev and Nginx in prod).
- The canonical role set is: `patient`, `head_of_household`, `doctor`, `caregiver`, `clinic_admin`, `support_agent`, `compliance_auditor`, `super_admin`.
- Run checks from `frontend/package.json` before finishing code changes (`cd frontend && npm run lint`, `cd frontend && npm run build`).

## Verification

- Admin account is seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars (not hardcoded).
- Backend health check: `GET http://localhost:3000/health`.
- Production health check: `GET https://afridiwins.online/health`.

## Production Deployment

- **Split architecture** (two VPS):
  - **ehcserver.webfrat.com** (164.132.187.36): main app — frontend + REST API + PostgreSQL + MinIO (new uploads).
  - **afridiwins.online** (74.208.36.213): WebSocket signaling server + TURN server + MinIO (old uploads).
- **SSH access**: key-based only (`~/.ssh/id_ed25519`). Password auth disabled.
- **Deploy**: `bash deploy.sh` from the project root on the VPS.
- **Process manager**: PM2 (`pm2 status`, `pm2 logs ecohealth-backend`).
- **Reverse proxy**: Nginx serves the built frontend and proxies `/api/` to the backend.
- **SSL**: Certbot/Let's Encrypt.

### Critical: Shared Secrets

Both servers MUST have identical values for these env vars:
- `JWT_SECRET` — used to sign/verify auth tokens. ehcserver issues tokens; afridiwins verifies them for WebSocket auth.
- `FILE_DOWNLOAD_SECRET` — used to generate/verify file download tokens. Files on afridiwins must be accessible with tokens generated on ehcserver.

If these secrets mismatch, WebSocket connections fail with "Invalid or expired token" and file downloads return 403 Forbidden.
