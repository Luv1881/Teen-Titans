Here’s a **copy-paste “big prompt”** for your coding agent—rewritten to use **Express.js (TypeScript)**, and upgraded with a **multi-tenant IAM** (Caterpillar ↔ Dealers ↔ Customers/Users) and a **Suggestion Engine** that weighs many factors before recommending actions.

---

# 🚧 Build Spec — Smart Rental Tracking System (Web PWA, Express.js)

## Mission

Deliver a **web-only, offline-capable PWA** for tracking construction/mining rental assets. No native apps. Must support:

1. QR/NFC **check-out / check-in**,
2. **Live dashboards** (map + table) for Caterpillar, dealers, and customer sites,
3. **Usage logging** (engine/idle hours, fuel, location, operator),
4. **Alerts** (due/overdue, excess idle, geofence, heartbeat),
5. **Multi-factor Suggestion Engine** (reposition, maintenance, extensions, swaps) with clear explanations,
6. **Multi-tenant IAM**: Caterpillar (org-wide), Dealers (their fleets & customers), Customer Users (their sites),
7. **Tamper-evident audit log**.

---

## Golden Tech Stack (stick to this)

**Frontend (PWA)**

* Next.js 14 (TypeScript, App Router), Tailwind + shadcn/ui, TanStack Query, Zod
* `next-pwa` (Workbox) + **Dexie (IndexedDB)** for offline cache & background sync
* QR: `@zxing/browser`; NFC (Android/Chrome): Web NFC (fallback to QR)
* Maps & geofences: MapLibre GL + `@maplibre/maplibre-gl-draw`
* Realtime: `socket.io-client`
* Auth: Auth.js (NextAuth) using JWT (issued by API) + optional WebAuthn passkeys
* Web Push: Firebase (FCM) or VAPID

**Backend (APIs + workers)**

* **Express.js (TypeScript)** with:

  * `zod` schemas + `express-zod-api` (or custom middlewares) for validation
  * `express-async-errors`, `helmet`, `cors`, `compression`
  * Auth: `passport-jwt` (or custom JWT middleware)
  * Logging: `pino-http`
  * Rate limiting: `express-rate-limit`
* ORM: **Prisma** → **PostgreSQL 15** with **PostGIS** & **TimescaleDB**
* Realtime: **Socket.IO** (server)
* Jobs/alerts/scheduling: **BullMQ** (Redis)
* Media: **S3/MinIO** via pre-signed URLs
* Optional IoT: **EMQX (MQTT)** → webhook → API → Timescale
* Observability: OpenTelemetry + Loki/Tempo (or just Pino → Loki), Sentry

**ML/Suggestions**

* Separate **FastAPI (Python)** service: scikit-learn / PyOD (anomalies), Prophet/XGBoost (demand), OR-Tools (assignment/transfer optimization)

**Dev/Deploy**

* Monorepo: Turborepo + pnpm
* Local: Docker Compose (Postgres+PostGIS+Timescale, Redis, MinIO, EMQX, API, workers, ML)
* Prod (simple): Vercel (web) + Fly/Railway (API/workers) + Neon/Supabase (Postgres) + Backblaze/S3 (media)

---

## Repo Layout

```
/smart-rental/
  apps/
    web/            # Next.js PWA
    api/            # Express TS API (Socket.IO included)
    workers/        # BullMQ processors (can live in api)
    ml/             # FastAPI (Python) for anomalies/forecast/optimization
  packages/
    types/          # Zod + TS types shared
    config/         # eslint, tsconfig, tailwind, prettier
  infra/
    docker-compose.yml
    prisma/         # schema.prisma + migrations + seed.ts
  .env.example
  README.md
```

---

## Multi-Tenant IAM (Caterpillar ↔ Dealers ↔ Customers/Users)

### Tenancy model

* **Organization** (table) with `orgType` ∈ {`CATERPILLAR`, `DEALER`, `CUSTOMER`}
* **Users** belong to one or more orgs via **Membership** with a **Role**
* **Data partitioning**: every row carries `orgOwnerId` (+ `dealerId`, `customerId` when applicable)
* **Visibility**

  * **Caterpillar HQ**: sees all orgs, all dealers, all customers (global ops center)
  * **Dealer**: sees its own fleet and its customer accounts/sites
  * **Customer**: sees only its sites/assets
* **RBAC/ABAC** with **Casbin** (Node) + **Postgres Row-Level Security**

  * JWT claims: `{ sub, orgId, orgType, role, dealerIds[], customerIds[], siteIds[] }`
  * Set Postgres session vars per request (e.g., `set_config('app.org_id', $orgId, true)`), enforce RLS in policies

### Roles & permissions (minimum)

* `CAT_ADMIN` (Caterpillar): global read/write, manage dealers, global suggestions, policies
* `DEALER_ADMIN`: manage dealer fleet, customers, approve/override suggestions
* `DEALER_DISPATCH`: daily ops, check-in/out, move/transport tasks
* `CUSTOMER_SUPERVISOR`: view & act on their sites, approve suggestions impacting them
* `OPERATOR`: scan/submit usage at assigned site(s), read own tasks

### Casbin example (policy lines—agent should generate file)

```
p, CAT_ADMIN, *, *, allow
p, DEALER_ADMIN, /dealer/:dealerId/*, (GET|POST|PUT|PATCH), allow
p, DEALER_DISPATCH, /ops/*, (GET|POST), allow
p, CUSTOMER_SUPERVISOR, /customer/:customerId/*, (GET|POST), allow
p, OPERATOR, /scan/*, (GET|POST), allow

g, user123, DEALER_ADMIN
```

---

## Data Model (Prisma — include org fields)

```prisma
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }

model Organization {
  id        String  @id @default(cuid())
  name      String
  orgType   OrgType
  createdAt DateTime @default(now())
  users     Membership[]
}

enum OrgType { CATERPILLAR DEALER CUSTOMER }

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  passkeyId String?  // WebAuthn optional
  createdAt DateTime @default(now())
  memberships Membership[]
}

model Membership {
  id        String @id @default(cuid())
  userId    String
  orgId     String
  role      Role
  user      User        @relation(fields: [userId], references: [id])
  org       Organization @relation(fields: [orgId], references: [id])
  @@unique([userId, orgId])
}

enum Role { CAT_ADMIN DEALER_ADMIN DEALER_DISPATCH CUSTOMER_SUPERVISOR OPERATOR }

model Site {
  id        String  @id @default(cuid())
  name      String
  customerId String  // Organization.id where orgType = CUSTOMER
  dealerId   String  // Organization.id where orgType = DEALER (servicing dealer)
  geofence   Json?   // GeoJSON; also add PostGIS geometry via migration
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  assets     Equipment[]
  @@index([customerId, dealerId])
}

model Equipment {
  id         String @id @default(cuid())
  humanId    String @unique // EQX1004
  type       String
  serial     String?
  status     EquipStatus @default(AVAILABLE)
  siteId     String?
  site       Site? @relation(fields: [siteId], references: [id])
  dealerId   String // owning dealer orgId
  customerId String? // if assigned
  trackerId  String?
  orgOwnerId String // owning org (dealer by default)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  rentals    Rental[]
  events     Event[]
  @@index([dealerId, customerId])
}

enum EquipStatus { AVAILABLE ON_RENT IDLE MAINTENANCE LOST }

model Rental {
  id            String   @id @default(cuid())
  equipmentId   String
  siteId        String
  operatorUserId String
  checkoutAt    DateTime
  dueAt         DateTime
  checkinAt     DateTime?
  expectedHours Float?
  totalRuntimeHours Float?
  totalIdleHours    Float?
  dealerId   String
  customerId String
  orgOwnerId String
  equipment  Equipment @relation(fields:[equipmentId], references:[id])
  site       Site      @relation(fields:[siteId], references:[id])
}

model UsageDaily {
  id          String  @id @default(cuid())
  equipmentId String
  date        DateTime
  runtimeH    Float @default(0)
  idleH       Float @default(0)
  fuelL       Float? @default(0)
  location    Json?
  source      String // scan | telemetry
  dealerId    String
  customerId  String?
  orgOwnerId  String
  @@unique([equipmentId, date])
}

model Maintenance {
  id          String  @id @default(cuid())
  equipmentId String
  type        String
  openedAt    DateTime @default(now())
  closedAt    DateTime?
  notes       String?
  dealerId    String
  customerId  String?
  orgOwnerId  String
}

model Event {
  id          String  @id @default(cuid())
  equipmentId String
  ts          DateTime @default(now())
  kind        String   // checkout, checkin, move, alert, photo, suggestion
  actorUserId String?
  payload     Json
  prevHash    String?
  selfHash    String
  dealerId    String?
  customerId  String?
  orgOwnerId  String
}

model Forecast {
  id            String  @id @default(cuid())
  siteId        String
  equipmentType String
  day           DateTime
  demandPred    Float
  p10           Float?
  p90           Float?
  suggestion    Json?  // e.g., {moves:[{from,to,qty,date,score,explanation}]}
  dealerId      String
  customerId    String?
  orgOwnerId    String
  @@unique([siteId, equipmentType, day])
}
```

**Migrations:** add PostGIS geometry columns (`Site.geofence_geom GEOGRAPHY(POLYGON,4326)`, `UsageDaily.location_point GEOGRAPHY(POINT,4326)`), and Timescale hypertable `usage_daily_ts(...)` for raw events. Enable **RLS** on tenant-scoped tables using session vars.

---

## API (Express.js) — routes to implement

**Auth & IAM**

* `POST /auth/otp` (email OTP) → `POST /auth/verify`
* `POST /auth/passkey/register` & `/auth/passkey/login` (optional)
* JWT carries `{sub, orgId, orgType, role, dealerIds, customerIds, siteIds}`
* Middleware chain: `jwt -> loadMembership -> setRlsSession -> casbinEnforce`

**Assets & Rentals**

* `GET /assets?dealerId=&customerId=&siteId=&status=&bbox=`
* `GET /assets/:humanId`
* `POST /rentals/checkout` → `{humanId, siteId, operatorUserId, engineStart, expectedHours, dueAt, photos[]}`
* `POST /rentals/checkin` → `{humanId, engineEnd, fuelL, photos[], notes}`
* `POST /usage/bulk` → offline sync payload array
* `POST /files/sign` → pre-signed S3 PUT

**Alerts & Suggestions**

* `GET /alerts` (filter by role/org scope)
* `GET /suggestions?horizon=7&siteId=&type=` — read latest generated items
* `POST /suggestions/act` — accept/decline with reason (feedback loop)
* `WS /realtime` — live alerts & suggestions stream

**Admin/Config**

* `GET/POST /sites` (geofence CRUD)
* `GET/POST /policies` (thresholds, weights per org/role)
* `GET /reports/utilization`, `/reports/idle`, `/reports/overdue`

---

## Suggestion Engine (multi-factor, explainable)

**Purpose:** Continuously propose **optimal actions** for each stakeholder (Caterpillar, dealer, customer) with an explainability string and score. Store as `Event(kind='suggestion')` and in `Forecast.suggestion`.

**Suggestion types**

* **Reposition/Transfer** assets across sites/customers
* **Rental extension vs return** recommendation
* **Asset swap** (high-health unit to critical site; pull low-health unit for service)
* **Maintenance schedule** (plan service at low-demand windows)
* **Anti-loss/anti-theft action** (unexpected motion while “checked in”)
* **Fuel optimization** (flag assets with outlier fuel/hour)

**Scoring (0–100)** — weighted sum (weights configurable per org/role)

* **Demand score**: predicted shortage/surplus (Prophet/XGBoost)
* **Utilization score**: current vs target utilization, idle ratio trends
* **Health score**: maintenance due, anomaly score (PyOD), fault codes if present
* **Proximity score**: travel time & transport cost (PostGIS distance; optional Maps API)
* **SLA score**: penalties risk, site priority/criticality
* **Inventory score**: dealer/customer available units by type
* **Weather/Calendar score**: monsoon/heat, holidays/shifts (optional)
* **Carbon score**: estimated CO₂ impact for move vs keep (optional)

**Output structure (example)**

```json
{
  "id": "sugg_abc",
  "type": "MOVE",
  "actorScope": "DEALER",      // who should act
  "dealerId": "org_d1",
  "customerId": "org_c9",
  "fromSite": "S003",
  "toSite": "S001",
  "equipmentType": "Excavator",
  "quantity": 2,
  "earliest": "2025-09-01",
  "score": 82.4,
  "factors": {
    "demand": +28,
    "utilization": +18,
    "health": +12,
    "proximity": +9,
    "sla": +10,
    "carbon": -4
  },
  "explanation": "S001 forecast shortage (p90) of 2 excavators next 5 days; S003 idle 31% avg; both units <200h to service; 1.2h transport; SLA breach risk high at S001.",
  "confidence": 0.76
}
```

**Human-in-the-loop**

* All suggestions appear in dashboards by role.
* **Accept/Decline** with reason; store feedback; update weights (simple online learning).
* A/B test thresholds per org (feature flag).

---

## User Interfaces (role-aware)

**Global Ops (Caterpillar)**

* World map: dealer clusters, fleet utilization heatmap, anomalies feed
* Leaderboards: idle% by dealer, SLA risk, forecast accuracy
* Policy editor (weights, thresholds); push nudges to dealers/customers

**Dealer**

* Fleet view: assets by customer/site, transfer planner, maintenance board
* Suggestions queue: accept/decline + dispatch work orders
* Revenue-at-risk (overdue, idle), transport calendar

**Customer**

* Site dashboard: on-rent list, due/overdue, utilization trend
* One-click actions: request extension, schedule pickup, approve move

**Common**

* **Scan** page (PWA): QR/NFC, offline capture, photo/video, background sync
* **Asset** detail: mini timeline, last location, health, upcoming maintenance
* Alerts rail with **live Socket.IO** updates

---

## PWA Offline

* Cache app shell with Workbox
* Queue POSTs for check-in/out & usage; **Background Sync** retries
* IndexedDB stores pending forms, photos (blobs), and last reads
* Upload large media when `navigator.connection.saveData === false` or on Wi-Fi

---

## Alerts (workers, BullMQ)

* Due in 24h / Overdue
* Idle ratio ≥ 0.5 for 3 consecutive days
* Geofence breach while runtime increases
* No heartbeat/scan > 12h
* Maintenance due @ 250h intervals (configurable)

---

## Docker Compose — services to include

* `postgres` (postgis + timescaledb enabled), `redis`, `minio`, `emqx` (optional), `api` (Express), `workers` (BullMQ), `ml` (FastAPI), `web` (Next.js)
* Seed script: creates Caterpillar org + 3 dealers + 10 customers, 30 sites w/ geofences, 300 assets, 12 months synthetic usage, rentals, alerts

---

## Acceptance Criteria

1. **Installable PWA**, works offline for scans and usage; background sync OK.
2. **Express API** with JWT + Casbin + Postgres **RLS** enforcing multi-tenancy.
3. **QR check-out/in** with photos → MinIO via pre-signed URLs; **hash-chained events**.
4. **Dashboards** adapt by role (Caterpillar/Dealer/Customer) & scope.
5. **Suggestions** generated daily + on-demand; each has **score + explanation**; can be **accepted/declined**; actions update state.
6. **Alerts** stream in realtime (Socket.IO) and resolve correctly.
7. **Geofence** enforcement at check-out; violations are blocked/logged.
8. **Reports**: utilization, idle%, overdue; export CSV.
9. **Seed** dataset + README demo script.

---

## ENV template (.env.example)

```
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/smart_rental
POSTGRES_HOST=postgres
POSTGRES_DB=smart_rental
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

REDIS_URL=redis://redis:6379

S3_ENDPOINT=http://minio:9000
S3_REGION=auto
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=smart-rental-media

JWT_SECRET=devjwt
NEXTAUTH_SECRET=devsecret

NEXT_PUBLIC_MAP_STYLE=https://demotiles.maplibre.org/style.json
NEXT_PUBLIC_WS_URL=ws://api:3000

ML_BASE_URL=http://ml:8000
```

---

## Developer Tasks (priority)

1. Monorepo scaffold; Express API with JWT, Pino, Helmet, Zod; Casbin + RLS session vars.
2. Prisma schema + migrations (PostGIS/Timescale + RLS policies).
3. Next.js PWA with Scan page (ZXing), Dexie offline queue, Workbox BG sync.
4. S3 pre-signed upload flow; media viewer.
5. Workers: alerts + daily rollups + suggestion cron (call ML).
6. ML service: anomaly scoring, 14-day demand forecast, transfer optimization; return scored suggestions + explanations.
7. Dashboards by role with MapLibre + tables; WS realtime tiles/alerts/suggestions.
8. Feedback loop for suggestions (accept/decline, reason logging).
9. Seed generator + demo script; README.

---

**Build exactly this with Express.js.** Keep code idiomatic, typed, and testable. Every suggestion must include a **score, confidence, and human-readable explanation**, and IAM must strictly partition data among **Caterpillar**, **dealers**, and **customers** while enabling global monitoring for Caterpillar and dealer-level oversight.
