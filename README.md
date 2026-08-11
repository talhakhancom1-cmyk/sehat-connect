# EcoHealth — Eco Health Cloud

A global, patient-owned healthcare operating platform. This repository contains the web/PWA client and the shared backend.

## Tech Stack

- **Frontend:** React 18 + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Node.js + Express + Sequelize ORM
- **Database:** PostgreSQL 18
- **Object Storage:** MinIO (S3-compatible)
- **Realtime:** Socket.IO
- **Cache:** Redis
- **Process Manager:** PM2
- **Reverse Proxy:** Nginx + Let's Encrypt SSL

## Prerequisites

1. Node.js 22+
2. PostgreSQL 18+
3. Redis
4. MinIO (or any S3-compatible storage)

## Run Locally

Install dependencies:

```bash
npm install
cd backend && npm install
```

Start both frontend and backend:

```bash
npm run dev:both
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000

Frontend only:

```bash
npm run dev
```

Backend only:

```bash
cd backend && npm run dev
```

## Environment Variables

Create `backend/.env` (see `backend/env.example` for template):

```bash
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ecohealth
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_secret
FILE_DOWNLOAD_SECRET=your_secret
CORS_ORIGIN=http://localhost:5173
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=your_key
MINIO_SECRET_KEY=your_secret
MINIO_BUCKET=ecohealth-uploads
REDIS_URL=redis://localhost:6379
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your_password
```

Create `.env.local` for frontend:

```bash
VITE_API_BASE_URL=http://localhost:3000/api
```

## Production Deployment

See `DEPLOYMENT_GUIDE.md` for full VPS deployment instructions.

Quick deploy on a fresh Ubuntu VPS:

```bash
git clone https://github.com/talhakhancom1-cmyk/ecohealth.git /tmp/ecohealth-deploy
cd /tmp/ecohealth-deploy
sudo DOMAIN=yourdomain.com bash deploy.sh
```

## Project Structure

```
src/              # Frontend source (React + Vite)
backend/          # Backend API (Express + Sequelize)
deploy.sh         # VPS deployment script
DEVELOPER_NOTES.md  # Full developer documentation
DEPLOYMENT_GUIDE.md # Step-by-step deployment guide
```

## Roles

- `patient` — Default patient role
- `head_of_household` — Household manager
- `doctor` — Healthcare provider
- `caregiver` — Caregiver with delegated access
- `clinic_admin` — Clinic administrator
- `support_agent` — Support staff
- `compliance_auditor` — Compliance reviewer
- `super_admin` — Full system access

## Author

Huraira Khan
