# Sehat Connect Backend

Node.js + Express + Sequelize backend for the Sehat Connect healthcare platform.

## Architecture

- **Framework:** Express.js
- **Database:** PostgreSQL 18 with Sequelize ORM
- **Object Storage:** MinIO (S3-compatible)
- **Realtime:** Socket.IO
- **Cache:** Redis
- **Process Manager:** PM2
- **Web Server:** Nginx (reverse proxy)

## Setup

```bash
cd backend
npm install
cp env.example .env  # Edit with your settings
npm run dev
```

## Key Directories

- `config/` — Database and MinIO configuration
- `constants/` — EHC role constants
- `lib/` — Library modules (realtime, scheduler, email, crypto, pagination)
- `middleware/` — Auth and API key middleware
- `models/` — Sequelize models (40+ tables)
- `routes/` — Express route handlers (35+ route files)

## Health Check

```bash
curl http://localhost:3000/health
```

## Environment Variables

See `env.example` for the full list. Critical variables:

- `JWT_SECRET` — Required, no fallback
- `DB_PASSWORD` — Required in production
- `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` — Required, no fallback
- `FILE_DOWNLOAD_SECRET` — Required, no fallback
- `CORS_ORIGIN` — Required in production
