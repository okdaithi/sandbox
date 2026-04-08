# Interactive Scenario Planning Web Application (Game Master System)

## 1. System Overview

The Interactive Scenario Planning Web Application is a real-time training platform for running structured decision simulations. Teams submit decisions, a deterministic scenario engine evaluates those decisions, and all participants receive synchronized state updates.

Key characteristics:
- Real-time collaborative sessions with multiple teams.
- Deterministic scenario progression driven by JSON-defined rules.
- Persistent audit trail of decisions and state changes.
- Facilitator-first operational model for creating and controlling sessions.
- Deployable locally (Docker or bare-metal) and on DigitalOcean App Platform.

---

## 2. Architecture (Implemented)

### Runtime stack
- **Frontend**: React 18 + TypeScript + MUI + Redux + Socket.io client (`localhost:3000`)
- **Backend**: Node.js 20 + Express + Socket.io server (`localhost:5000`)
- **Database**: PostgreSQL 15 (`localhost:5432`)
- **Cache / PubSub**: Redis 7 (`localhost:6379`)
- **Real-time scaling**: Socket.io Redis adapter (pub/sub across backend instances)

### ASCII architecture diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│                              Browser                                │
│               React + Redux + MUI + Socket.io client               │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP + WebSocket
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Node.js 20 / Express / Socket.io                │
│  - REST API (/api/auth, /api/scenarios, /api/sessions, /api/health)│
│  - Auth (JWT in httpOnly cookie)                                    │
│  - Scenario Engine (decision processing + state mutation)           │
└───────────────────┬───────────────────────────────┬─────────────────┘
                    │                               │
                    ▼                               ▼
      ┌────────────────────────────┐     ┌──────────────────────────┐
      │      PostgreSQL 15         │     │          Redis 7         │
      │ users/scenarios/sessions   │     │ cache + Socket.io pub/sub│
      │ decisions/teams/audit_logs │     │                          │
      └────────────────────────────┘     └──────────────────────────┘
```

---

## 3. Core Components

### Frontend components
- **Login**: user authentication entry point.
- **Dashboard**: scenario/session view for participants.
- **FacilitatorPanel**: facilitator tools (lazy-loaded).

### Backend route modules (implemented)
- `auth` routes for login/register/logout.
- `scenarios` routes for list/detail reads.
- `sessions` routes for session lifecycle and decision submission/retrieval.

### Scenario Engine
The engine processes decision payloads against the scenario’s `rules_definition` and current session state:
1. Evaluate conditions.
2. Match keywords to decision options.
3. Apply state mutations.
4. Evaluate outcomes.
5. Return enriched feedback + updated state.

### Primary data flows
- **Auth flow**: login/register → JWT cookie issuance → authenticated API access.
- **Decision flow**: decision submission → engine execution → DB persistence → state update broadcast.
- **Real-time flow**: user joins session socket room → backend emits `state_updated` / status events.

---

## 4. Data Model (Current Schema)

Tables:
- `users` (`id`, `username`, `password_hash`, `role`, `created_at`)
- `scenarios` (`id`, `name`, `description`, `initial_state`, `rules_definition`, timestamps)
- `sessions` (`id`, `scenario_id`, `facilitator_id`, `status`, timing fields, `current_state`)
- `teams` (`id`, `session_id`, `name`, `members`)
- `decisions` (`id`, `session_id`, `team_id`, `decision_data`, `timestamp`, `processed`)
- `audit_logs` (`id`, `session_id`, `event_type`, `event_data`, `timestamp`)

Relationships:
- `sessions.scenario_id` → `scenarios.id`
- `sessions.facilitator_id` → `users.id`
- `teams.session_id` → `sessions.id`
- `decisions.session_id` → `sessions.id`
- `decisions.team_id` → `teams.id`
- `audit_logs.session_id` → `sessions.id`

---

## 5. Scenario Engine Design

Scenario definitions are JSON-driven:
- `initial_state`: starting phase, variables, history.
- `rules_definition`: actors, decision points, keyword-based options, event triggers, and outcome conditions.

Decision processing model:
1. Load current session state (or scenario initial state).
2. Perform keyword matching against option keyword arrays.
3. Evaluate trigger conditions (`gt`, `gte`, `lt`, composite conditions, etc.).
4. Apply `state_changes`:
   - `variables` = absolute replacement (`{ "cash_reserves": 7000000 }`)
   - `variables_delta` = relative mutation (`{ "cash_reserves": -400000 }` or `{ "cash_reserves": { "op": "add", "value": -400000 } }`)
5. Evaluate event triggers and outcome conditions.
6. Return canonical result object used for API response and socket broadcast.

---

## 6. Real-Time Communication

Socket.io is used for live synchronization:
- Client authenticates socket with JWT token in handshake auth.
- Client joins `session-{id}` room using `join_session` event.
- Server broadcasts scenario progression events (for example `state_updated`, `session_status_changed`) to room participants.
- Redis adapter enables pub/sub-backed fan-out when backend replicas are scaled.

---

## 7. API Specification (Implemented Endpoints Only)

> Note: except for health check, routes are protected by auth middleware and require valid JWT context.

### Auth
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`

### Scenarios
- `GET /api/scenarios`
- `GET /api/scenarios/:id`

### Sessions
- `POST /api/sessions`
- `GET /api/sessions/:id`
- `PATCH /api/sessions/:id/status`
- `POST /api/sessions/:id/decisions`
- `GET /api/sessions/:id/decisions`

### Health
- `GET /api/health`

---

## 8. Prerequisites

Required tools:
- **Docker 24+** and **Docker Compose v2+** (recommended path).
- **Node.js 20+** and **npm 10+** (bare-metal dev path).
- **PostgreSQL client (`psql`)** for schema/seed execution.
- **doctl CLI** for DigitalOcean deployment automation.

---

## 9. Local Deployment — Option A (Docker Compose, Recommended)

1. **Clone repository**
   ```bash
   git clone <your-repo-url>
   cd sandbox
   ```

2. **Create environment file**
   ```bash
   cp docker/.env.example docker/.env
   ```
   Edit values, especially credentials and `JWT_SECRET`.

3. **Generate strong JWT secret**
   ```bash
   openssl rand -hex 64
   ```
   Paste output into `docker/.env` as `JWT_SECRET`.

4. **Build and start all services**
   ```bash
   docker compose -f docker/docker-compose.yml up -d --build
   ```

5. **Verify service health**
   ```bash
   docker compose -f docker/docker-compose.yml ps
   docker compose -f docker/docker-compose.yml logs -f backend
   ```

6. **Schema bootstrapping behavior**
   - On first DB initialization, PostgreSQL loads `database/schema.sql` through `docker-entrypoint-initdb.d`.
   - `database/schema.sql` is migration-style and assumes the target DB is already selected by the runtime environment (for Docker this is handled by `POSTGRES_DB`).
   - You do **not** need to run schema manually for first boot with a fresh DB volume.

7. **Seed scenarios (manual step, required)**
   ```bash
   docker compose -f docker/docker-compose.yml exec -T db \
     psql -U dbuser -d scenario_planning -f /dev/stdin < database/seed-scenarios.sql
   ```

8. **Create a facilitator account**
   ```bash
   curl -X POST http://localhost:5000/api/auth/register \
     -H 'Content-Type: application/json' \
     -d '{"username":"admin","password":"securepass123","role":"facilitator"}'
   ```

9. **Open the app**
   - Frontend: http://localhost:3000
   - Backend health: http://localhost:5000/api/health

---

## 10. Local Deployment — Option B (Bare Metal)

Use this when developing without containers.

1. Install and run PostgreSQL 15 + Redis 7 locally.
2. Create DB + apply schema (manual setup):
   ```bash
   createdb scenario_planning
   psql -d scenario_planning -f database/schema.sql
   ```
   Alternatively, run the optional bootstrap script from an existing database connection:
   ```bash
   psql -d postgres -f database/bootstrap.sql
   ```
3. Seed scenarios:
   ```bash
   psql -d scenario_planning -f database/seed-scenarios.sql
   ```
4. Start backend:
   ```bash
   cp backend/.env.example backend/.env
   # edit DATABASE_URL, REDIS_URL, JWT_SECRET, FRONTEND_URL, PORT
   cd backend
   npm install
   npm run dev
   ```
5. Start frontend:
   ```bash
   cd frontend
   npm install
   REACT_APP_API_URL=http://localhost:5000 npm start
   ```
6. Access app: http://localhost:3000

---

## 11. Environment Variable Reference

| Variable | Used by | Description | Example |
|---|---|---|---|
| `POSTGRES_DB` | docker-compose, db | Database name | `scenario_planning` |
| `POSTGRES_USER` | docker-compose, db | DB username | `dbuser` |
| `POSTGRES_PASSWORD` | docker-compose, db | DB password | `strong_password_here` |
| `DATABASE_URL` | backend | Full PostgreSQL connection string | `postgresql://dbuser:pass@db:5432/scenario_planning` |
| `REDIS_URL` | backend | Redis connection string | `redis://redis:6379` |
| `JWT_SECRET` | backend | JWT signing secret (min 32+ chars recommended) | `$(openssl rand -hex 64)` |
| `NODE_ENV` | backend | Runtime mode | `production` / `development` |
| `FRONTEND_URL` | backend | Allowed CORS origin | `http://localhost:3000` |
| `PORT` | backend | Backend port (default 5000) | `5000` |
| `REACT_APP_API_URL` | frontend build arg/runtime env | Backend URL embedded in frontend build | `http://localhost:5000` |

---

## 12. Cloud Deployment — DigitalOcean App Platform

### 12.1 Create DigitalOcean resources
1. Container Registry:
   ```bash
   doctl registry create your-org --subscription-tier starter
   ```
2. Managed PostgreSQL: create in DO console or `doctl databases create ...`
3. Managed Redis: create in DO console or `doctl databases create --engine redis ...`

### 12.2 Configure GitHub Secrets
In **GitHub → Settings → Secrets and variables → Actions**, configure:
- `DIGITALOCEAN_ACCESS_TOKEN`
- `DO_REGISTRY_NAME` (e.g. `your-org`)
- `DO_APP_ID` (from `doctl apps list`, after initial create)
- `REACT_APP_API_URL` (public base URL, e.g. `https://your-domain.com`)
- `DATABASE_URL` (managed PostgreSQL URL)

### 12.3 Customize `do-app-spec.yaml`
- Replace `your-org` with your DOCR registry name.
- Replace `https://your-domain.com` with real public domain.
- Set `JWT_SECRET`, `DATABASE_URL`, and `REDIS_URL` as secrets.

### 12.4 First deployment (one-time)
1. Build/push images manually or trigger CI by pushing to `main`.
2. Create app:
   ```bash
   doctl apps create --spec do-app-spec.yaml
   ```
3. Capture returned app ID and store it as `DO_APP_ID` GitHub secret.
4. Run schema migration:
   ```bash
   psql "$DATABASE_URL" -f database/schema.sql
   ```
5. Seed scenarios:
   ```bash
   psql "$DATABASE_URL" -f database/seed-scenarios.sql
   ```

### 12.5 Subsequent deployments
Push to `main`; the workflow executes:
1. test
2. image build + push
3. schema migration
4. App Platform deployment trigger
5. smoke test (`/api/health`)

### 12.6 Cost guidance (approximate)
- Backend `basic-xs`: ~USD $12/month
- Frontend `basic-xxs`: ~USD $5/month
- Plus managed PostgreSQL + managed Redis pricing

---

## 13. First Login / Initial Setup

Important:
- `database/schema.sql` includes placeholder users with **example** bcrypt hashes not intended for real login.
- Register an actual facilitator account after deployment.

Example API call:
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"securepass123","role":"facilitator"}'
```

Then login via UI or `POST /api/auth/login`.

---

## 14. Technology Stack Justification (Trimmed)

- **React + TypeScript + MUI**: fast UI delivery with type safety and accessible component system.
- **Node.js + Express**: straightforward API and socket integration with low operational complexity.
- **PostgreSQL**: reliable relational core with JSONB support for scenario payloads.
- **Redis**: low-latency cache and pub/sub backbone for real-time scaling.
- **Socket.io**: robust browser/server real-time abstraction with fallback behavior and room semantics.

---

## 15. Risk Analysis (Trimmed)

- **State consistency under concurrency**: mitigate with deterministic engine behavior and serialized write patterns.
- **Auth/session security**: enforce strong JWT secret management and secure cookie settings in production.
- **Scenario quality risk**: malformed JSON rules can produce weak exercises; validate scenario definitions before release.
- **Operational risk**: missed seed/migration steps can leave environment partially functional; use CI migration and smoke tests.

---

## 16. Development Roadmap

- **Phase 1 (Complete)**: auth, scenario read APIs, session lifecycle, decision submission, real-time updates, Dockerization.
- **Phase 2**: richer facilitator tooling, team/session administration enhancements, improved validation.
- **Phase 3**: analytics, replay/export refinements, scenario authoring UX.
- **Phase 4**: advanced multi-instance scale tuning, observability, enterprise hardening.
