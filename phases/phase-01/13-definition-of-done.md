# Phase 1 — Spec 13: Definition of Done & Verification

> The acceptance contract for Phase 1. This is the checklist a reviewer and the
> implementer actually run before calling Phase 1 "done". It consolidates the
> acceptance criteria from specs `00`–`09` (specs `06`, `07`, `08`, `10`, `11`,
> `12` are not yet written as of this document; their criteria here are derived
> from the overview `00`, the RBAC matrix `04`, and the data model `01`, and must
> be reconciled with those specs when they land). If a numbered domain spec and
> this document conflict, the domain spec wins for its slice; this document wins
> over assumptions. RBAC is verified **server-side**, not by hidden buttons.

Phase 1 is done when a reviewer can: log in as any of the 6 seeded roles,
navigate every sidebar page, perform CRUD on every module the role is allowed to,
be blocked (HTTP 403 from the API) from what the role is not allowed to, and see a
dashboard populated entirely from seeded PostgreSQL data — with the same
`migrate` + `seed` commands working against both local Docker Postgres and Neon.

---

## 1. Phase 1 exit criteria (master checklist)

GitHub-style checkboxes grouped by area. Each group cites the spec it is pulled
from. Items are summarized, not copied.

### 1.1 Database & migrations (spec `01`)

- [ ] `Backend/src/db/migrate.js` exists; `npm run migrate` applies all pending
      numbered SQL files in `Backend/src/db/migrations/` in lexical order.
- [ ] `schema_migrations(version, applied_at)` table tracks applied versions;
      each migration runs inside a transaction.
- [ ] `npm run migrate` is **idempotent** — a second run applies nothing and does
      not error.
- [ ] All ENUM types created (`user_role`, `table_status`, `order_type`,
      `order_status`, `payment_status`, `payment_method`, `stock_movement_type`,
      `purchase_order_status`, `invoice_status`, `measurement_unit`).
- [ ] Every table from spec `01` §5 exists with correct PKs
      (`bigint GENERATED ALWAYS AS IDENTITY`), constraints, and CHECKs.
- [ ] `set_updated_at()` trigger attached to **every** table; `updated_at`
      auto-updates on UPDATE.
- [ ] Indexes and unique constraints created per spec `01` (`uq_users_email`,
      `idx_orders_status`, etc.).
- [ ] FK `ON DELETE` behaviors match spec `01` (RESTRICT / SET NULL / CASCADE as
      listed).
- [ ] Money is `numeric(12,2)`, quantities `numeric(12,3)`; no float/double for
      money or stock.
- [ ] `monthly_expense_summary` view (or documented equivalent query) exists.
- [ ] DB resets cleanly via `docker compose down -v` then re-migrate.

### 1.2 Seed data (spec `02`)

- [ ] `npm run seed` runs clean after `npm run migrate` on an empty DB.
- [ ] Re-running `npm run seed` does not duplicate rows or error (idempotent;
      truncate+reinsert or upsert per spec).
- [ ] All 6 role users seeded with bcrypt-hashed passwords (hashed in the seed via
      the shared `hashPassword`, cost 10 — no pre-computed hashes).
- [ ] 2–3 extra staff seeded so Staff lists are non-trivial (8–10 users total).
- [ ] Row-count minimums met (suppliers 6, ingredients 20–30, products 20–30,
      menu_items 25–35, orders 40–60, order_items 120+, expense_records 40–60,
      etc. per spec `02` §4).
- [ ] 4–6 ingredients **and** 4–6 products below reorder level (low-stock widget).
- [ ] Several orders in non-terminal statuses (`open`/`preparing`/`ready`) with
      matching `restaurant_tables.status = 'occupied'` (active orders + occupancy).
- [ ] Dates spread across the **last 6 months** for orders, expenses, and POs
      (time-series widgets have shape).
- [ ] Totals/ledgers internally consistent: `order_items.line_total =
      quantity * unit_price`; order/PO/invoice totals equal line sums + tax;
      received POs have matching `stock_in` movements reflected in
      `products.current_stock`.
- [ ] The **same** command populates Neon (see §7).

### 1.3 Authentication (spec `03`)

- [ ] `POST /api/auth/login` returns a valid JWT + public user for each seeded
      role; email normalized to lowercase.
- [ ] Login failure is uniform (`Invalid credentials`) for both unknown email and
      wrong password (no user enumeration); deactivated user → 401.
- [ ] `GET /api/auth/me` returns the current user (re-fetched); 401 if the user is
      missing/deactivated.
- [ ] `POST /api/auth/logout` returns `200 { data: { success: true } }`.
- [ ] `POST /api/auth/change-password` verifies current password, hashes new,
      400 on wrong current.
- [ ] Passwords bcrypt-hashed (cost 10); no plaintext stored, logged, or returned.
- [ ] `password_hash` never appears in **any** API response.
- [ ] JWT is HS256, 12h expiry; server **fails to boot** without `JWT_SECRET`.
- [ ] `authMiddleware` rejects missing/malformed/expired tokens with 401.

### 1.4 RBAC & roles (spec `04`)

- [ ] `requireRole(...)` implemented with default-deny + owner-bypass.
- [ ] Every protected route declares its allowed roles per the spec `04` matrix.
- [ ] Missing/invalid token → **401**; valid token, wrong role → **403** (two
      distinct cases).
- [ ] Field-level restrictions enforced in the **service** (cashier → only order
      payment fields; chef → only order `status` kitchen transitions; menu-item
      pricing not editable by chef).
- [ ] Ownership/self rules enforced (manager cannot act on an owner; nobody can
      deactivate/delete their own account; manager cannot change own role or mint
      owners).
- [ ] Verified via curl/Postman with role tokens, not just via hidden UI (see §3).

### 1.5 Backend conventions (spec `05`)

- [ ] Every module follows routes / controller / service / validation split;
      controllers hold no SQL and no business rules.
- [ ] All writes validated with Zod; `422` + `{ message, errors[] }` on failure;
      `.strict()` guards mass-assignment.
- [ ] All list endpoints paginate + sort (whitelisted columns only) + filter and
      return `meta = { page, limit, total, totalPages }`.
- [ ] Success envelope: single → `{ data }`, collection → `{ data, meta }`;
      201 on create, 200 on read/update, 200/204 on delete.
- [ ] Multi-statement writes (orders+items, PO receiving, invoice+items) are
      transactional via `withTransaction`.
- [ ] Central error middleware maps Postgres codes (23505→409, 23503→409/400,
      23514→422, 22P02→400); no SQL or stack traces leak to clients.
- [ ] No raw client input concatenated into SQL anywhere (parameterized queries;
      sort identifiers via allow-list only).
- [ ] Shared utils present: `async-handler`, `api-error`, `respond`,
      `pagination`, `with-transaction`, `jwt`, `password`, `validate.middleware`.

### 1.6 Module family — Restaurant Operations (spec `06`; derived from `00`/`01`/`04`)

Covers Tables, Menu Categories, Menu Items, Recipes, Orders.

- [ ] Tables: CRUD; status transitions (`available`/`occupied`/`reserved`/
      `out_of_service`); unique label.
- [ ] Menu Categories & Menu Items: CRUD; items linked to a category; price ≥ 0;
      availability toggle; soft delete via `is_active`/`is_available`.
- [ ] Recipes & recipe ingredients: CRUD; one recipe per menu item; ingredient
      lines with quantity + unit.
- [ ] Orders: create with items; server **recomputes** subtotal/tax/discount/total
      from `order_items` (never trusts client totals); item name/price snapshotted.
- [ ] Order status flow enforced; cashier payment fields + chef kitchen status
      field-level RBAC honored.

### 1.7 Module family — Inventory & Supply (spec `07`; derived from `00`/`01`/`04`)

Covers Ingredients, Suppliers, Product Categories, Products, Warehouses, Stock
In/Out, Purchase Orders.

- [ ] Ingredients: CRUD; `current_stock`/`reorder_level`; low-stock when
      `current_stock <= reorder_level`.
- [ ] Suppliers, Product Categories, Warehouses: CRUD with soft delete.
- [ ] Products: CRUD; unique SKU; stock kept in sync by movements/PO receiving.
- [ ] Stock movements: recorded as positive quantity; direction derived from
      `movement_type`; delta applied to `products.current_stock` in the same
      transaction (ledger and balances agree).
- [ ] Purchase Orders: CRUD; line items; receiving increments
      `quantity_received`, creates `stock_in` movements, updates stock, advances
      status (`partially_received`/`received`) atomically.

### 1.8 Module family — Expenses & Invoices (spec `08`; derived from `00`/`01`/`04`)

Covers Expense Categories, Expense Records, Supplier Invoices, Monthly Expense
Tracking.

- [ ] Expense Categories: CRUD (soft delete).
- [ ] Expense Records: CRUD; amount ≥ 0; `expense_date`; optional supplier/invoice
      link.
- [ ] Supplier Invoices: **manual** CRUD (create/list/edit/delete) with line
      items; totals = line sums + tax; status flow (`pending`/`verified`/`paid`/
      `disputed`).
- [ ] Invoice **file upload** works: binary stored under `Backend/src/uploads/`,
      only `file_url` persisted; `ocr_raw` stays null (Phase 2).
- [ ] Monthly Expense Tracking aggregates by month (view or service query).

### 1.9 Module — Staff & Users (spec `09`)

- [ ] `/api/users` full CRUD (list w/ filters+search+sort+pagination, get, create,
      update, reset-password, soft-delete via `is_active`).
- [ ] `password_hash` never returned (all paths use `toPublicUser`).
- [ ] Duplicate email → 409, not found → 404, validation → 422.
- [ ] Manager cannot create/modify/deactivate/reset an owner → 403.
- [ ] Manager cannot elevate anyone (incl. self) to `owner` → 403.
- [ ] No user can deactivate/delete their own account → 403.
- [ ] Manager cannot change their own role → 403.
- [ ] chef/waiter/cashier/store_manager → 403 on every `/api/users` route.

### 1.10 Dashboard (spec `10`; widgets from `00` §Dashboard)

- [ ] All 8 widgets render **non-empty** from seeded data: Sales Overview, Active
      Orders, Table Occupancy, Low Stock Items, Monthly Expenses, Purchase
      Summary, Profit Overview, Supplier Summary (see §5).
- [ ] Every widget reads live DB data via a backend endpoint (no hardcoded/mock
      numbers).

### 1.11 Frontend foundation (spec `11`; derived from `00`/`03`/`04`/AGENTS.md)

- [ ] Login page authenticates against `POST /api/auth/login`; token stored per
      the frontend storage decision; unauthenticated users redirected to login.
- [ ] API client attaches `Authorization: Bearer <token>`; on 401 clears session
      and redirects to login.
- [ ] Dashboard shell with sidebar navigation to every module page.
- [ ] Shared components (table, form, modal, filters, buttons) with consistent
      spacing/typography.
- [ ] Role-aware UX: controls the current role cannot use are hidden/disabled
      (UX only — server still enforces).

### 1.12 Frontend pages (spec `12`; pages from `00`/AGENTS.md)

- [ ] Every sidebar route renders **real data**, not a static placeholder.
- [ ] Every module page supports its CRUD end-to-end through the UI (see §4).
- [ ] Every data view has loading, empty, and error states (see §6).
- [ ] Invoice upload & review page lets a user upload a file and see it attached.
- [ ] No route a reviewer clicks returns a `{ status: "pending" }` / placeholder.

### 1.13 Design quality (AGENTS.md Design Requirements)

- [ ] Dashboard layout with clear navigation; dense, product-like screens (not a
      marketing landing page).
- [ ] Consistent spacing, typography, empty/loading/error states.
- [ ] UI text fits containers on **desktop and mobile** (no overflow/clipping).
- [ ] Tables, forms, filters, action buttons are easy to scan and use.
- [ ] No generic gradient-heavy hero; no one-note palette.

---

## 2. Runbook — running Phase 1 from scratch

Windows dev machine. Commands are shown for **PowerShell**; POSIX (Git Bash)
notes are called out where they differ. Run all `npm` commands from the repo root
unless stated. Root `package.json` uses npm **workspaces** (`Backend`,
`Frontend`).

### 2.0 Prerequisites

- [ ] **Node.js** 20 LTS or newer (`node -v`), npm 10+ (`npm -v`).
- [ ] **Docker Desktop** running (`docker version` succeeds).
- [ ] Ports free: `5432` (Postgres), `4000` (Backend), `3000` (Frontend).

### 2.1 Start PostgreSQL (Docker)

```powershell
docker compose up -d postgres
docker compose ps        # STATUS should show "healthy" before continuing
```

> The container is `restaurantos-postgres` (image `postgres:16-alpine`), data in
> the `postgres-data` named volume. To fully reset the DB later:
> `docker compose down -v` (drops the volume), then repeat migrate + seed.

### 2.2 Install dependencies

Root install hydrates both workspaces (`Backend` and `Frontend`) at once:

```powershell
npm install
```

If a workspace needs its own install (or you prefer explicit installs):

```powershell
npm install --prefix Backend
npm install --prefix Frontend
```

> Backend gains new deps in Phase 1 (`bcrypt`/`bcryptjs`, `jsonwebtoken`, `zod`,
> `multer`, migration runner). If `bcrypt` native build fails on Windows, switch
> to `bcryptjs` (spec `03` §2).

### 2.3 Configure environment

Copy the example env to a real `.env` and edit secrets:

```powershell
Copy-Item .env.example .env
```

POSIX equivalent: `cp .env.example .env`.

- [ ] Set `JWT_SECRET` to a long random string (the server **refuses to boot** if
      it is empty — spec `03`).
- [ ] Confirm `DATABASE_URL` points at the Docker Postgres
      (`postgresql://restaurantos:restaurantos@localhost:5432/restaurantos`).
- [ ] `PORT=4000`, `FRONTEND_ORIGIN=http://localhost:3000`,
      `NEXT_PUBLIC_API_URL=http://localhost:4000/api`.

> If the Backend/Frontend read `.env` from their own folders, copy it there too
> (e.g. `Copy-Item .env Backend\.env`). Document the actual load path in the
> README once the loader is wired.

### 2.4 Run migrations, then seed

Backend scripts `migrate` and `seed` are added in Phase 1 (spec `01` §8,
spec `02` §2). Run them from the `Backend` workspace:

```powershell
npm --prefix Backend run migrate
npm --prefix Backend run seed
```

- [ ] `migrate` prints applied versions and exits 0.
- [ ] `seed` finishes clean; re-running either is safe (idempotent).

### 2.5 Start the backend

```powershell
npm run dev:backend
```

(This runs `nodemon src/server.js` in `Backend`.) Verify health in a second
shell:

```powershell
curl.exe http://localhost:4000/health
```

> On Windows PowerShell use `curl.exe` (the bare `curl` is an alias for
> `Invoke-WebRequest` and takes different flags). Expect a 200 health response.

### 2.6 Start the frontend

In a new terminal:

```powershell
npm run dev:frontend
```

(Runs `next dev` in `Frontend`.) For a production-style check:
`npm run build:frontend` and `npm run lint:frontend`.

### 2.7 Open the app and log in

- [ ] Open `http://localhost:3000`.
- [ ] Log in as **owner** — `owner@restaurantos.test` / `Owner@123`.
- [ ] Confirm the dashboard loads with populated widgets and the sidebar lists
      every module.

---

## 3. Manual QA script (reviewer walkthrough)

Perform this as a fresh reviewer. Log in as **each** of the 6 seeded roles and
verify what they can and cannot do. Credentials from spec `02` §3:

| # | Role          | Email                     | Password    |
|---|---------------|---------------------------|-------------|
| 1 | owner         | owner@restaurantos.test   | Owner@123   |
| 2 | manager       | manager@restaurantos.test | Manager@123 |
| 3 | chef          | chef@restaurantos.test    | Chef@123    |
| 4 | waiter        | waiter@restaurantos.test  | Waiter@123  |
| 5 | cashier       | cashier@restaurantos.test | Cashier@123 |
| 6 | store_manager | store@restaurantos.test   | Store@123   |

### 3.1 Per-role walkthrough

For **each** role, in order:

1. [ ] Log in; confirm you land on the dashboard and `GET /api/auth/me` returns
       the correct role.
2. [ ] Confirm the sidebar only surfaces pages appropriate to the role (UX gating).
3. [ ] Open every page the role **can** access; confirm data renders (not
       placeholder), and CRUD controls appear where allowed.
4. [ ] Attempt at least one **forbidden** action (e.g. waiter tries to create a
       product) and confirm it is blocked — and confirm the block is **server-side**
       (§3.3), not just a missing button.
5. [ ] Log out; confirm the token is discarded and protected pages redirect to
       login.

Role-specific spot checks (from the spec `04` matrix):

- [ ] **owner** — full access to everything, incl. Staff and profile/config CRUD.
- [ ] **manager** — nearly full ops; can manage staff **except owners**; cannot
      elevate to owner or delete self.
- [ ] **chef** — reads menu/recipes/ingredients; updates order kitchen status;
      **no** access to products/suppliers/POs/staff.
- [ ] **waiter** — tables + orders (create/update items); **no** payment
      checkout, **no** inventory/staff.
- [ ] **cashier** — reads menu/orders; updates order **payment** fields only; no
      item edits, no inventory/staff.
- [ ] **store_manager** — full inventory/supply + expenses/invoices; **no**
      orders, tables, menu, recipes, or staff.

### 3.2 Auth negative checks (any role)

- [ ] Call a protected endpoint with **no** `Authorization` header → **401**.
- [ ] Call with a malformed/expired token → **401**.
- [ ] Log in with a wrong password and a nonexistent email → **both** return the
      same `Invalid credentials` (no enumeration).
- [ ] Inspect any user/login/me response body → **no** `password_hash` field.

### 3.3 RBAC smoke matrix (verify via API, not just UI)

Grab a token per role (`POST /api/auth/login` → `data.token`), then hit each
endpoint below with that token. **The point is server-side enforcement**: a
`403` must come from the API even when the UI would have hidden the control.

Example (PowerShell):

```powershell
$tok = (curl.exe -s -X POST http://localhost:4000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"waiter@restaurantos.test","password":"Waiter@123"}' |
  ConvertFrom-Json).data.token

curl.exe -s -o NUL -w "%{http_code}`n" -X POST http://localhost:4000/api/products `
  -H "Authorization: Bearer $tok" -H "Content-Type: application/json" `
  -d '{"sku":"X","name":"Y","unit":"unit"}'
# expect: 403
```

Expected status per role (✅ = allowed 200/201, 403 = forbidden). Owner is
allowed everywhere (owner-bypass).

| # | Endpoint (representative)        | owner | manager | chef | waiter | cashier | store_manager |
|---|---------------------------------|-------|---------|------|--------|---------|---------------|
| 1 | `POST /api/users`               | ✅    | ✅*     | 403  | 403    | 403     | 403           |
| 2 | `GET  /api/users`               | ✅    | ✅      | 403  | 403    | 403     | 403           |
| 3 | `POST /api/products`            | ✅    | ✅      | 403  | 403    | 403     | ✅            |
| 4 | `POST /api/suppliers`           | ✅    | ✅      | 403  | 403    | 403     | ✅            |
| 5 | `POST /api/purchase-orders`     | ✅    | ✅      | 403  | 403    | 403     | ✅            |
| 6 | `POST /api/orders`              | ✅    | ✅      | 403  | ✅     | 403     | 403           |
| 7 | `PATCH /api/orders/:id` (payment)| ✅   | ✅      | 403  | 403†   | ✅      | 403           |
| 8 | `PATCH /api/orders/:id` (kitchen status)| ✅ | ✅ | ✅   | 403†   | 403     | 403           |
| 9 | `POST /api/menu-items`          | ✅    | ✅      | 403‡ | 403    | 403     | 403           |
| 10| `POST /api/recipes`             | ✅    | ✅      | ✅   | 403    | 403     | 403           |
| 11| `POST /api/supplier-invoices`   | ✅    | ✅      | 403  | 403    | 403     | ✅            |
| 12| `POST /api/expense-records`     | ✅    | ✅      | 403  | 403    | 403     | ✅            |

Notes:
- `*` manager creating an **owner** account → 403 (ownership rule, spec `04` §5 /
  `09` §6). Manager creating a non-owner → 201.
- `†` waiter may create/update order **items** but not payment fields; a
  payment-only PATCH → 403 (field-level RBAC). Kitchen-status-only PATCH by a
  waiter → 403.
- `‡` chef is read/availability-only on menu items; creating a menu item → 403
  (pricing/creation is manager/owner, spec `04` §4).

> Endpoint paths above are representative; reconcile exact route names with the
> module specs `06`–`08` when they are written. For each row, also confirm the
> **allowed** cell actually returns 200/201 (not a silent failure) and the
> **forbidden** cell returns 403 (not 401 — 401 means the token was rejected, a
> different failure).

---

## 4. Per-module CRUD verification

For **every** module: create → read/list → update → delete through the **UI**,
then confirm the change **persisted in PostgreSQL** (query the table directly via
`docker compose exec postgres psql -U restaurantos -d restaurantos` or a DB GUI).
"Delete" means soft delete (deactivate/cancel) where spec `01` §1.4 applies.

For each module, check all four:

- [ ] **Table Management** (`restaurant_tables`) — create/edit/status change,
      persists; unique label enforced.
- [ ] **Order Management** (`orders` + `order_items`) — create with items, totals
      recomputed server-side, status/payment update, cancel; persists.
- [ ] **Menu Management** (`menu_categories`, `menu_items`) — CRUD; availability
      toggle; persists.
- [ ] **Recipe Management** (`recipes`, `recipe_ingredients`) — CRUD with
      ingredient lines; persists.
- [ ] **Ingredient Management** (`ingredients`) — CRUD; stock/reorder edits;
      persists.
- [ ] **Supplier Management** (`suppliers`) — CRUD; deactivate; persists.
- [ ] **Staff Management** (`users`) — create/edit/reset-password/deactivate;
      persists; no `password_hash` leak.
- [ ] **Product Management** (`products`) — CRUD; unique SKU; persists.
- [ ] **Category Management** (`product_categories` and `menu_categories`) —
      CRUD; persists.
- [ ] **Warehouse / Store Management** (`warehouses`) — CRUD; persists.
- [ ] **Stock In / Stock Out** (`stock_movements`) — record movement; product
      `current_stock` updates in the same transaction; ledger row persists.
- [ ] **Purchase Orders** (`purchase_orders` + `_items`) — CRUD; receiving
      creates stock movements + updates stock + advances status; persists.
- [ ] **Expense Categories** (`expense_categories`) — CRUD; persists.
- [ ] **Expense Records** (`expense_records`) — CRUD; persists.
- [ ] **Supplier Invoice Management** (`supplier_invoices` + `_items`) — CRUD +
      **file upload** (binary on disk, `file_url` persisted); persists.
- [ ] **Monthly Expense Tracking** — read/aggregate view reflects seeded +
      newly-created expense records.

For each: after a UI create, run e.g.
`SELECT * FROM <table> ORDER BY id DESC LIMIT 1;` and confirm the row matches;
after a UI delete, confirm `is_active = false` / `status = cancelled` (soft) or
the row is gone (hard, only where allowed).

---

## 5. Dashboard verification

Log in (owner) and confirm all **8** widgets render **non-empty** from seeded
data (spec `10`; widget list from `00`/AGENTS.md). Each must reflect live DB
values, not mock data.

- [ ] **Sales Overview** — revenue totals/trend from paid orders over the seeded
      date range.
- [ ] **Active Orders** — count/list of orders in `open`/`preparing`/`ready`.
- [ ] **Table Occupancy** — occupied vs available from `restaurant_tables.status`.
- [ ] **Low Stock Items** — ingredients **and** products where
      `current_stock <= reorder_level`.
- [ ] **Monthly Expenses** — expense totals by month (last 6 months) from
      `expense_records` / `monthly_expense_summary`.
- [ ] **Purchase Summary** — PO counts/values by status.
- [ ] **Profit Overview** — revenue − cost is meaningful (menu cost set).
- [ ] **Supplier Summary** — supplier counts / spend / active suppliers.

Cross-check: change underlying data (e.g. mark another order paid) and confirm the
relevant widget updates on reload.

---

## 6. Cross-cutting checks

- [ ] **Loading / empty / error states** present on **every** data view (list,
      detail, dashboard widget). Force each: throttle network (loading), filter to
      no results (empty), stop the backend or return an error (error state shows a
      message, not a blank/broken page).
- [ ] **Text fits containers** on desktop **and** mobile widths (test at ~375px
      and ~1440px). No clipped labels, overflowing table cells, or broken layout.
- [ ] **No pending/placeholder responses** — every mounted route returns real
      data; none returns `{ status: "pending" }` or a stub page.
- [ ] **JWT required on protected routes** — every `/api/*` route except
      `POST /api/auth/login` (and `/health` outside `/api`) returns **401** with
      no/invalid token.
- [ ] **No `password_hash` leaks** — grep every response shape (login, me, users
      list/detail, any embedded user) for `password_hash`; must be absent.
- [ ] **Totals/ledgers internally consistent** — order totals = item sums + tax −
      discount; PO/invoice totals = line sums + tax; stock movement ledger agrees
      with `products.current_stock`.
- [ ] **No SQL / stack traces** leak in error responses (spec `05` §2.2); only
      friendly `message` (+ `errors[]` for 422).

---

## 7. Neon parity check

The same `migrate` + `seed` must produce the same dataset on Neon (spec `02` §6).

1. [ ] Point `DATABASE_URL` at the Neon connection string (with `sslmode=require`
       as Neon requires).
2. [ ] Run `npm --prefix Backend run migrate` against Neon — all migrations apply,
       `schema_migrations` populated.
3. [ ] Run `npm --prefix Backend run seed` against Neon. Because seeding truncates,
       set `SEED_ALLOW_PROD=true` if `NODE_ENV=production` guards it (spec `02`
       §2.1) so Neon is only reset intentionally.
4. [ ] Log in against a backend pointed at Neon with the seeded credentials;
       confirm dashboard widgets are populated identically to local.
5. [ ] Confirm no reliance on manually entered local rows — everything a reviewer
       sees comes from the seed command.

---

## 8. "Ready for Phase 2" gate

Do **not** start AI features until all of the following are true (AGENTS.md
Phase 2/3 ordering; overview `00` §2):

- [ ] Core app is **usable** end-to-end: login → dashboard → CRUD on every module
      → RBAC enforced server-side. (§§1–6 pass.)
- [ ] **Supplier Invoice manual CRUD + file upload** works: create/list/edit/
      delete invoices with line items, upload a PDF/image, `file_url` persisted,
      `ocr_raw` still null. (This is the surface Phase 2 OCR plugs into.)
- [ ] **PostgreSQL is the source of truth**: all writes go through Express +
      migrations/seed; no data lives only in memory or only on the frontend; Neon
      parity (§7) confirmed.
- [ ] `ai-service/` (FastAPI) remains **untouched** — no AI/OCR logic leaked into
      Express (overview `00` §3).
- [ ] App stays runnable; no broken migrations/seeds; no placeholder routes.

Only when this gate is green does Phase 2 (AI predictions + AI/OCR invoice
extraction + Excel expense register) begin.

---

## 9. Known limitations to carry into the README

Record these in the README "Known limitations" section (AGENTS.md Phase 4). They
are **accepted** for Phase 1, not defects:

- [ ] **No refresh token** — access-token-only JWT (12h expiry); users re-login
      after expiry (spec `03` §4).
- [ ] **No login rate limiting / lockout** — flagged as a Phase 3 nicety
      (spec `03` §9).
- [ ] **AI / OCR not implemented** — invoice extraction, shortage/reorder/pricing/
      prep-time/waste predictions, and the Excel expense register are Phase 2;
      `supplier_invoices.ocr_raw` is reserved and unused.
- [ ] **No self-registration** — accounts are created only by owner/manager via
      Staff Management (spec `03` §6).
- [ ] **Email immutable after create**; password changes only via self
      change-password or admin reset (spec `09` §5).
- [ ] **App Dockerfiles not included** — only Docker Compose for local Postgres;
      app containers are a later bonus (overview `00` §2).
- [ ] **No WebSockets / notifications / audit-trail UI / dark mode / CSV import** —
      all Phase 3 (overview `00` §2).
- [ ] **Frontend permission gating is UX only** — security is the server-side
      RBAC; hidden buttons are convenience, not a control.
- [ ] Ingredients are **not** tracked per-warehouse in Phase 1 (only products are;
      spec `01` §2).
```
