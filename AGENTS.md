# AGENTS.md

## Project Context

Eco Health Cloud (Sehat) is a global, patient-owned healthcare operating platform. This repository contains the **Website / PWA client** and the **shared backend**. Per the Engineering Bible, all four clients (Website, Windows, iOS, Android) present the same backend and the same PostgreSQL database through the same API — there is one backend, one database, and multiple presentation layers.

The project runs as a standalone Vite frontend + Express/Sequelize backend.

## Architecture

- **Frontend**: React 18 + Vite, installable as a PWA.
- **Backend**: Node.js + Express + Sequelize ORM.
- **Database**: PostgreSQL 18 (single logical database).
- **Object storage**: MinIO (S3-compatible) for file uploads.
- **Realtime / Chat**: scaffolded via REST (WebSocket/Socket.IO to follow).
- **Storage / Payments / Calls**: intentionally abstracted so each can be wired to country-specific providers.
- **Security**: Helmet, rate limiting, JWT auth, bcrypt, session revocation, audit logging.

## Key Files

- `src/`: web application source.
- `backend/`: shared backend source.
- `backend/models/User.js`: canonical EHC role model (Section 4).
- `backend/server.js`: Express server, database sync, admin seeding.
- `backend/config/database.js`: PostgreSQL connection.
- `backend/config/minio.js`: MinIO (S3) client for file storage.
- `backend/middleware/auth.js`: JWT authentication + role checks.
- `backend/lib/parseSort.js`: shared sort parameter parser.
- `src/lib/useRole.js`: frontend role helpers using the canonical EHC roles.
- `src/api/base44Client.js`: frontend API client that routes to the backend.
- `vite.config.js`: Vite config with path aliases.
- `.env.local` (root): frontend dev env vars.
- `.env.production` (root): frontend prod env vars (VITE_API_BASE_URL).
- `backend/env.example`: backend env template.
- `backend/ecosystem.config.js`: PM2 process config.
- `backend/nginx.conf`: Nginx site config for production.
- `deploy.sh`: VPS deployment script for Ubuntu 26.

## Working Notes

- Use `npm run dev:both` to start the Vite frontend and Express backend together.
- Backend-only work: `cd backend && npm run dev` (nodemon) or `node server.js`.
- Frontend-only work: `npm run dev`.
- The API base is `/api` (relative, proxied by Vite in dev and Nginx in prod).
- The canonical role set is: `patient`, `head_of_household`, `doctor`, `caregiver`, `clinic_admin`, `support_agent`, `compliance_auditor`, `super_admin`.
- Run checks from `package.json` before finishing code changes (`npm run lint`, `npm run build`).

## Verification

- Admin account is seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars (not hardcoded).
- Backend health check: `GET http://localhost:3000/health`.
- Production health check: `GET https://afridiwins.online/health`.

## Production Deployment

- **VPS**: Ubuntu with Node.js 22, PostgreSQL 18, Nginx, PM2, MinIO, Redis, Certbot.
- **Domain**: `ehcserver.webfrat.com`.
- **Deploy**: `bash deploy.sh` from the project root on the VPS.
- **Process manager**: PM2 (`pm2 status`, `pm2 logs sehat-connect-backend`).
- **Reverse proxy**: Nginx serves the built frontend and proxies `/api/` to the backend.
- **SSL**: Certbot/Let's Encrypt.
