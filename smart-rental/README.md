# Smart Rental Tracking System

This project is a web-based, offline-capable PWA for tracking construction and mining rental assets.

## Features

- QR/NFC check-out / check-in
- Live dashboards (map + table) for Caterpillar, dealers, and customer sites
- Usage logging (engine/idle hours, fuel, location, operator)
- Alerts (due/overdue, excess idle, geofence, heartbeat)
- Multi-factor Suggestion Engine (reposition, maintenance, extensions, swaps)
- Multi-tenant IAM: Caterpillar (org-wide), Dealers (their fleets & customers), Customer Users (their sites)
- Tamper-evident audit log

## Tech Stack

- **Frontend (PWA):** Next.js 14 (TypeScript, App Router), Tailwind + shadcn/ui, TanStack Query, Zod
- **Backend (APIs + workers):** Express.js (TypeScript)
- **ORM:** Prisma
- **Database:** PostgreSQL 15 with PostGIS & TimescaleDB
- **Realtime:** Socket.IO
- **Jobs/alerts/scheduling:** BullMQ (Redis)
- **ML/Suggestions:** FastAPI (Python)
- **Dev/Deploy:** Turborepo + pnpm, Docker Compose

## Getting Started

1.  Clone the repository.
2.  Install dependencies: `pnpm install`
3.  Start the services: `docker-compose up -d`
4.  Run database migrations: `pnpm --filter api exec prisma migrate dev`
5.  Seed the database: `pnpm --filter api exec prisma db seed`
6.  Start the applications: `pnpm dev`
