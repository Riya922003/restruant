# Phase 1 — Core / Basic Requirements (Overview)

> This is the index and contract document for Phase 1 of RestaurantOS. Read this
> first. Every other spec in `phases/phase-01/` refines a slice of what is
> defined here. If a detail conflicts, the numbered spec for that domain wins over
> this overview, and this overview wins over assumptions.

## 1. Purpose of Phase 1

Deliver a **working, reviewable, RBAC-secured restaurant management product** on
PostgreSQL, with real CRUD across every core module and a functional dashboard.
No AI, no OCR, no bonus features in this phase. Those are Phase 2 and Phase 3.

Phase 1 is "done" when a reviewer can log in as any role, navigate every page in
the sidebar, perform create/read/update/delete on every module they are allowed
to, be blocked (server-side) from what they are not allowed to, and see a
dashboard populated from seeded PostgreSQL data.

## 2. Scope

In scope for Phase 1:

- Authentication (login, password hashing, JWT, `/me`, logout).
- Role based access control enforced on the **backend**.
- Roles: Owner, Manager, Chef, Waiter, Cashier, Store Manager.
- Core CRUD modules (all 16 listed in `AGENTS.md`).
- Dashboard with 8 analytics widgets.
- Database migrations (schema) and seed files (demo data).
- Frontend pages for every module, usable (not static placeholders).

Explicitly **out** of scope for Phase 1 (do not build yet):

- AI predictions (shortage, reorder, pricing, prep time, waste) — Phase 2.
- AI/OCR invoice extraction and Excel expense register — Phase 2.
- WebSockets, notifications, audit trail UI, dark mode, CSV import — Phase 3.
- Dockerfiles for the apps (Docker Compose for Postgres already exists) — later.

Note: Supplier Invoice **CRUD** (manual entry, list, edit, delete, file upload
metadata) **is** in Phase 1. Only the AI/OCR extraction of invoices is Phase 2.

## 3. Architecture recap

Three services already scaffolded in the repo:

| Service     | Path        | Responsibility in Phase 1                                  |
|-------------|-------------|------------------------------------------------------------|
| Frontend    | `Frontend/` | Next.js dashboard UI, login, all module pages.             |
| Backend     | `Backend/`  | Express API: auth, RBAC, validation, all CRUD, PostgreSQL. |
| ai-service  | `ai-service/` | FastAPI — **untouched in Phase 1**, reserved for Phase 2. |

Hard rules from `AGENTS.md`:

- PostgreSQL is the single source of truth.
- Express owns product rules, auth, RBAC, validation, and all DB writes.
- FastAPI is only for AI/OCR (Phase 2). **No AI/OCR logic in Express.**
- Frontend permissions are UX only. Security is enforced server-side.

## 4. Tech stack (pinned to what is already scaffolded)

- **Frontend:** Next.js `16.2.11` (App Router), React `19.2.4`, TypeScript `^5`,
  Tailwind CSS `^4`. NOTE: `Frontend/AGENTS.md` warns this Next.js version has
  breaking changes vs training data — read `node_modules/next/dist/docs/` before
  writing frontend code.
- **Backend:** Node.js, Express `^5.2.1` (CommonJS, `"type": "commonjs"`),
  `pg ^8.16.3` (raw pool, no ORM), `cors`, `dotenv`. Dev: `nodemon`.
- **Database:** PostgreSQL 16 (Docker locally via `docker-compose.yml`, Neon in
  hosted/demo).
- **Dependencies to ADD in Phase 1** (not yet in `Backend/package.json`):
  - `bcrypt` (password hashing) — or `bcryptjs` if native build is a problem.
  - `jsonwebtoken` (JWT sign/verify).
  - `zod` (request validation) — chosen validation library for this project.
  - `multer` (already implied by `upload.middleware.js`; add if missing) for
    invoice file upload metadata handling.
  - A migration runner: `node-pg-migrate` **or** a hand-rolled numbered-SQL
    runner. See spec `01`. Decision recorded there.

Do not add any other dependency without a reason. Do not introduce an ORM.

## 5. Existing scaffolding (current state)

Everything is stubbed. Confirmed placeholder state as of Phase 1 start:

- `Backend/src/app.js` — Express app wired with cors, json, `/health`, `/api`
  router, error middleware. **Keep.**
- `Backend/src/routes.js` — registers all 13 module route files. **Keep, extend.**
- `Backend/src/middlewares/auth.middleware.js` — `authMiddleware` is a no-op
  `next()`. **Must implement.**
- `Backend/src/middlewares/rbac.middleware.js` — `requireRole` returns a no-op.
  **Must implement.**
- `Backend/src/middlewares/error.middleware.js` — minimal, usable. Extend for
  Zod errors (see spec `05`).
- `Backend/src/config/env.js`, `config/database.js` — usable pool + env. **Keep.**
- `Backend/src/utils/api-error.js`, `async-handler.js`, `pagination.js` — some are
  stubs/empty; implement per spec `05`.
- `Backend/src/modules/*/` — each has a `*.routes.js` returning
  `{ module: "x", status: "pending" }`. Auth module has controller/service/
  validation stubs too. **All to be implemented.**
- `Backend/src/db/seed.js` — prints "Seed script pending". **Implement per `02`.**
- `Backend/src/db/migrations/` and `db/seeds/` — empty (`.gitkeep`).
- `Frontend/app/dashboard/*` — one `page.tsx` per route + `layout.tsx` with a
  nav. Login page + root page exist. **All to be implemented per `11`/`12`.**
- `ai-service/*` — scaffolded FastAPI. **Do not touch in Phase 1.**

## 6. Cross-cutting API conventions (authoritative)

These apply to **every** backend endpoint. Full detail in spec `05`; summary here
so all module specs can assume it.

### 6.1 Base path & versioning
- All API routes are mounted under `/api` (see `app.js`). Example:
  `GET /api/orders`. No `/v1` prefix in Phase 1.

### 6.2 Success response envelope
```json
{ "data": <payload>, "meta": { ...optional pagination/aggregates } }
```
- Single resource: `data` is an object.
- Collection: `data` is an array; `meta` carries pagination (see 6.4).
- `201 Created` for creates, `200 OK` for reads/updates, `200`/`204` for deletes.

### 6.3 Error response envelope
```json
{ "message": "Human readable error", "errors": [ { "field": "email", "message": "..." } ] }
```
- `errors` present only for validation (422) failures.
- Handled centrally by `error.middleware.js`. Controllers throw `ApiError`.

### 6.4 Pagination, sorting, filtering (list endpoints)
- Query params: `page` (default 1), `limit` (default 20, max 100), `sort`
  (e.g. `-created_at` for desc), plus module-specific filters (e.g. `status`,
  `search`, `supplier_id`).
- Response `meta`: `{ "page": 1, "limit": 20, "total": 137, "totalPages": 7 }`.

### 6.5 Auth
- All routes except `POST /api/auth/login` and `GET /health` require a valid
  `Authorization: Bearer <jwt>` header. Enforced by `authMiddleware` (spec `03`).
- Authorization (role checks) via `requireRole(...)` per route (spec `04`).

### 6.6 Timestamps, ids, money
- Ids: `bigint` identity, exposed as JSON numbers/strings. (See `01` for the
  id-type decision and rationale.)
- Timestamps: `timestamptz`, ISO-8601 in JSON (`created_at`, `updated_at`).
- Money: PostgreSQL `numeric(12,2)`; never floats. Serialized as strings or
  fixed-2 numbers — module specs state which. Currency is restaurant-wide (see
  `restaurant_profile`), default assumed but not hardcoded in business logic.

### 6.7 Validation
- Every request body/query is validated with a Zod schema before the controller
  runs. Invalid input → `422` with the error envelope. No unvalidated writes.

## 7. Backend module anatomy (every CRUD module follows this)

```
Backend/src/modules/<name>/
  <name>.routes.js        # mount function, wires middleware + controller
  <name>.controller.js    # HTTP layer: parse, call service, shape response
  <name>.service.js       # business logic + SQL (via pool), transactions
  <name>.validation.js    # Zod schemas for create/update/query
  <name>.repository.js     # (optional) raw SQL if service grows > ~300 lines
```
Split any file that crosses ~300–400 lines (AGENTS.md rule). Keep SQL in the
service/repository, never in controllers or routes.

## 8. Execution sequence for Phase 1

Follow this order (mirrors `AGENTS.md` execution discipline). Keep the app
runnable after each step.

1. **Data model + migrations** (spec `01`) — schema in PostgreSQL, runnable
   migrate command, `updated_at` triggers, indexes.
2. **Seed data** (spec `02`) — one command populates local and Neon identically.
3. **Auth + RBAC** (specs `03`, `04`) — real login, JWT, middleware, role matrix.
4. **Backend conventions + shared utils** (spec `05`) — error handling,
   async-handler, pagination, Zod wiring, response envelope helper.
5. **Core backend CRUD** (specs `06`, `07`, `08`, `09`) — implement each module's
   endpoints, validation, RBAC, business rules.
6. **Dashboard analytics endpoints** (spec `10`).
7. **Frontend foundation** (spec `11`) — auth flow, API client, layout, design
   system, shared components.
8. **Frontend pages** (spec `12`) — wire every module page to its API.
9. **Verify against Definition of Done** (spec `13`).

## 9. Spec index

| Spec | File | Owns |
|------|------|------|
| 00 | `00-phase-1-overview.md` | This document. Scope, conventions, sequencing. |
| 01 | `01-data-model-and-migrations.md` | Schema, enums, constraints, indexes, migration runner. |
| 02 | `02-seed-data.md` | Demo data, test users/credentials, idempotent seeding, Neon parity. |
| 03 | `03-authentication.md` | Hashing, JWT, login/me/logout, auth middleware. |
| 04 | `04-rbac-and-roles.md` | Roles, permission matrix, `requireRole`, ownership rules. |
| 05 | `05-backend-conventions.md` | Module layout, Zod, errors, pagination, envelope, transactions. |
| 06 | `06-module-restaurant-operations.md` | Tables, Menu, Orders, Recipes. |
| 07 | `07-module-inventory-and-supply.md` | Ingredients, Products, Product Categories, Suppliers, Warehouses, Stock In/Out, Purchase Orders. |
| 08 | `08-module-expenses-and-invoices.md` | Expense Categories, Expense Records, Supplier Invoices, Monthly Expense Tracking. |
| 09 | `09-module-staff-and-users.md` | Staff/User management CRUD, role assignment. |
| 10 | `10-dashboard-analytics.md` | 8 dashboard widgets with SQL + endpoints. |
| 11 | `11-frontend-foundation.md` | Shell, auth flow, API client, design system, shared UI. |
| 12 | `12-frontend-pages.md` | Per-route page specs. |
| 13 | `13-definition-of-done.md` | Acceptance checklist, QA script, exit criteria. |

## 10. Definition of Done (Phase 1 headline criteria)

Full checklist in spec `13`. Headline gates:

- [ ] `docker compose up -d postgres` + migrate + seed produces a working DB.
- [ ] The **same** seed command populates Neon.
- [ ] Login works for every role with seeded credentials (documented in `02`).
- [ ] JWT required on all protected routes; missing/invalid token → 401.
- [ ] RBAC blocks unauthorized actions **server-side** → 403 (verified, not just
      hidden buttons).
- [ ] Every module supports its full CRUD via API and UI.
- [ ] Every sidebar page renders real data with loading/empty/error states.
- [ ] Dashboard shows all 8 widgets from live DB data.
- [ ] No route a reviewer clicks returns a "pending"/placeholder response.
- [ ] App stays runnable; no broken migrations or seeds.

## 11. Conventions reminders (from AGENTS.md)

- No em dashes in code comments.
- Comment only non-obvious business logic / failure handling.
- No abstractions before they are useful; no unrelated refactors.
- Files stay under ~300–400 lines; split deliberately.
- Small commits, clear messages, keep the app runnable at every step.
