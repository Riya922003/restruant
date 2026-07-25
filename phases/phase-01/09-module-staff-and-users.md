# Phase 1 — Spec 09: Staff & Users Module

> Admin CRUD over the staff directory. The `users` table (spec `01`) doubles as
> the staff directory: there is **no separate `staff` table**, and `role`
> distinguishes staff type. Depends on spec `01` (schema), spec `03`
> (hashing, `toPublicUser`, self-service auth), spec `04` (RBAC matrix,
> ownership/self rules), and spec `05` (module anatomy, validation, envelope,
> pagination, error mapping). Mounted at `/api/users`; the
> `Backend/src/modules/users/users.routes.js` stub already exists.

## 1. Purpose

This module is the **admin-facing** management of staff/user accounts:

- Create staff accounts (any role, subject to RBAC).
- List/read the staff directory with filtering and search.
- Update a user's profile, `role`, and `is_active` status.
- Deactivate/reactivate a user (soft delete via `is_active`).
- Admin reset of another user's password (no knowledge of the old password).

It is **distinct from self-service auth** (spec `03`):

| Concern                         | Owner spec | Endpoint(s)                                   |
|---------------------------------|-----------|-----------------------------------------------|
| Login / current user / logout   | `03`      | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` |
| A user changing **own** password| `03`      | `POST /api/auth/change-password`              |
| Admin managing **other** users  | `09` (this)| `/api/users/*`                               |

Self-registration is **not** exposed anywhere (spec `03` §6). All accounts are
created here by an owner or manager.

## 2. Data model

Backed entirely by the `users` table (spec `01` §5.1):

| Column        | Type        | Notes                                           |
|---------------|-------------|-------------------------------------------------|
| id            | bigint identity | PK                                          |
| full_name     | text        | NOT NULL                                        |
| email         | text/citext | NOT NULL, UNIQUE (`uq_users_email`), lowercased |
| password_hash | text        | NOT NULL (bcrypt). **Never returned.**          |
| role          | user_role   | NOT NULL (owner/manager/chef/waiter/cashier/store_manager) |
| phone         | text        | NULL                                            |
| is_active     | boolean     | NOT NULL DEFAULT true                           |
| last_login_at | timestamptz | NULL (set by login, spec `03`; read-only here)  |
| created_at    | timestamptz | NOT NULL DEFAULT now()                          |
| updated_at    | timestamptz | NOT NULL DEFAULT now() (trigger `set_updated_at`)|

- Soft delete: `DELETE` sets `is_active = false` (spec `01` §1.4). No hard delete
  of users in Phase 1, so FKs from `orders.waiter_id`,
  `*.created_by`, and `stock_movements.created_by` stay intact.
- `last_login_at` is maintained by the login flow (spec `03`); this module treats
  it as read-only and never accepts it in a request body.

## 3. Public user mapper

Every response uses the shared `toPublicUser(row)` mapper (spec `03` §6.1) so
`password_hash` never leaves the service:

```js
// Backend/src/utils/public-user.js (shared with auth module)
function toPublicUser(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    is_active: row.is_active,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
```

- `SELECT` statements may fetch `password_hash` (needed for admin reset compare
  paths) but the mapper is applied before responding.
- Never log `password_hash` or plaintext passwords (spec `03` §9).

## 4. Endpoints

Mounted under `/api/users`. Allowed roles come from the spec `04` matrix row
**Staff / Users = owner CRUD, manager CRUD\*** (the `*` is the owner restriction
from spec `04` §5, enforced in the service, not just the route). `owner` is
omitted from `requireRole` lists because of the owner-bypass (spec `04` §2.1).

| Method | Path                              | Description                                             | Allowed roles (route) | Success |
|--------|-----------------------------------|--------------------------------------------------------|-----------------------|---------|
| GET    | `/api/users`                      | List staff; filter by `role`, `is_active`, `search`    | owner, manager        | 200     |
| GET    | `/api/users/:id`                  | Get one user by id                                     | owner, manager        | 200     |
| POST   | `/api/users`                      | Create a staff account                                 | owner, manager\*      | 201     |
| PATCH  | `/api/users/:id`                  | Update `full_name`/`phone`/`role`/`is_active` (partial)| owner, manager\*      | 200     |
| POST   | `/api/users/:id/reset-password`   | Admin reset another user's password                    | owner, manager\*      | 200     |
| DELETE | `/api/users/:id`                  | Deactivate (soft delete via `is_active = false`)       | owner, manager\*      | 200     |

`*` The route-level check allows `manager`; the **service** additionally enforces
the owner/self rules in §6 and throws `403 ApiError` when a manager targets an
owner, elevates to owner, or acts on their own account in a forbidden way.

### 4.1 Route wiring (matches spec `05` §1.1)

```js
const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const ctrl = require("./users.controller");
const { createSchema, updateSchema, querySchema, resetPasswordSchema } = require("./users.validation");

function mountUsersRoutes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/",    requireRole("manager"), validate(querySchema, "query"), ctrl.list);
  router.get("/:id", requireRole("manager"), ctrl.getById);
  router.post("/",   requireRole("manager"), validate(createSchema), ctrl.create);
  router.patch("/:id", requireRole("manager"), validate(updateSchema), ctrl.update);
  router.post("/:id/reset-password", requireRole("manager"), validate(resetPasswordSchema), ctrl.resetPassword);
  router.delete("/:id", requireRole("manager"), ctrl.remove);

  parentRouter.use("/users", router);
}
module.exports = mountUsersRoutes;
```

- `owner` is not listed; the owner-bypass in `requireRole` (spec `04` §2.1) admits
  owners to every route.
- `router.use(authMiddleware)` applies auth to the whole module (spec `05` §9).

## 5. Validation (Zod)

`Backend/src/modules/users/users.validation.js`. Use `.strict()` to reject
unknown keys (mass-assignment guard, spec `05` §3). `last_login_at`,
`password_hash`, `id`, `created_at`, `updated_at` are never accepted in bodies.

### 5.1 `createSchema` (POST body)

```js
const { z } = require("zod");

const userRole = z.enum(["owner", "manager", "chef", "waiter", "cashier", "store_manager"]);

const createSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required").max(120),
  email: z.string().trim().email("A valid email is required").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: userRole,
  phone: z.string().trim().max(30).optional(),
}).strict();
```

- `email` is trimmed and lowercased before insert; the DB `uq_users_email` unique
  index is the final guard (spec `01`).
- `password` is hashed with bcrypt cost 10 via the shared `hashPassword` helper
  (spec `03` §3) inside the service; plaintext is never stored or returned.
- `role` uses the `user_role` enum values verbatim (spec `01` §3).

### 5.2 `updateSchema` (PATCH body, partial)

```js
const updateSchema = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  role: userRole.optional(),
  is_active: z.boolean().optional(),
}).strict().refine((b) => Object.keys(b).length > 0, {
  message: "At least one field must be provided",
});
```

- `email` and `password` are **not** updatable via PATCH. Password changes go
  through `POST /api/users/:id/reset-password` (admin) or
  `POST /api/auth/change-password` (self, spec `03`). Email is immutable in
  Phase 1 to keep login identity stable.
- Field-level RBAC on `role` and `is_active` is enforced in the service (§6, §7),
  not by the schema.

### 5.3 `resetPasswordSchema` (POST reset body)

```js
const resetPasswordSchema = z.object({
  new_password: z.string().min(8, "Password must be at least 8 characters"),
}).strict();
```

### 5.4 `querySchema` (GET list query)

```js
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),                 // whitelist applied in service
  role: userRole.optional(),
  is_active: z.coerce.boolean().optional(),
  search: z.string().trim().max(120).optional(),
}).strict();
```

## 6. Ownership / self rules (CRITICAL — spec `04` §5)

Enforced in the **service layer** with `ApiError(403, ...)`, because these depend
on the target row (fetched from DB) and on `req.user`, which route-level
`requireRole` cannot see. Owner bypasses all of these (owner may do anything).

Rules (all from spec `04` §5 and the matrix note `*`):

1. **Manager cannot act on an owner.** A manager may not create, update,
   deactivate, delete, or reset-password an account whose current `role` is
   `owner`. Only an owner can create/modify owners.
2. **Manager cannot elevate anyone to owner.** A manager may not set
   `role = 'owner'` on create or update. Only an owner can mint owners.
3. **No self-deactivate / self-delete.** No user (including owner) may set their
   own `is_active = false` or `DELETE` their own account. Prevents lockout.
4. **Manager cannot change their own role.** A manager may not modify
   `req.user.role` on their own account (no self-privilege change / demotion
   games). Owner may change their own profile but is still bound by rule 3.

### 6.1 Who-can-do-what-to-whom matrix

Actor role (rows) acting on a target user of a given role (columns). Cell values:
**C**reate an account of that role, **U**pdate profile/role, **A**ctivate/
deactivate (`is_active` + `DELETE`), **P** admin password reset.

| Actor → Target      | owner        | manager | chef/waiter/cashier/store_manager |
|---------------------|--------------|---------|-----------------------------------|
| **owner**           | C U A P (not self-A) | C U A P | C U A P                    |
| **manager**         | — (403)      | C U A P (not self-role, not self-A) | C U A P     |
| chef/waiter/cashier/store_manager | — | —       | — (no route access, 403)          |

Notes:
- "not self-A": nobody may deactivate/delete themselves (rule 3), including owner
  acting on the owner row and manager acting on the manager row.
- "not self-role": a manager may not change their own `role` (rule 4).
- Elevating a target **to** owner is a C/U into the "owner" column and is allowed
  only for the owner actor (rule 2).
- Non-management roles have no route access at all (`requireRole` → 403 before the
  service runs).

## 7. Field-level RBAC (spec `04` §4)

Enforced in the service after loading the target row, before the write:

- **`role = 'owner'`** may be set (create or update) **only by an owner.** A
  manager attempting it → `403 "Only an owner can assign the owner role"`.
- **Target is an owner** and actor is a manager → `403 "Managers cannot modify an
  owner account"` (covers update, is_active toggle, delete, reset-password).
- **`is_active` toggle on self** (setting own account inactive) → `403 "You
  cannot deactivate your own account"`. Applies via PATCH and DELETE.
- **`role` change on self by a manager** → `403 "You cannot change your own
  role"`.

Suggested guard sketch (service):

```js
function assertCanManage(actor, targetRow, patch) {
  const isSelf = actor.id === targetRow.id;

  if (actor.role !== "owner" && targetRow.role === "owner") {
    throw new ApiError(403, "Managers cannot modify an owner account");
  }
  if (patch.role === "owner" && actor.role !== "owner") {
    throw new ApiError(403, "Only an owner can assign the owner role");
  }
  if (isSelf && patch.is_active === false) {
    throw new ApiError(403, "You cannot deactivate your own account");
  }
  if (isSelf && patch.role && patch.role !== targetRow.role && actor.role !== "owner") {
    throw new ApiError(403, "You cannot change your own role");
  }
}
```

The same self-deactivate check is applied in `remove` (DELETE), which maps to
`is_active = false`.

## 8. Error semantics

| Case                                            | Status | Message                                             |
|-------------------------------------------------|--------|-----------------------------------------------------|
| Body/query fails Zod validation                 | 422    | `Validation failed` + `errors[]` (spec `05` §3)     |
| Email already exists (`23505` on `uq_users_email`)| 409  | `A user with this email already exists`             |
| User id not found                               | 404    | `User not found`                                    |
| Manager targets/creates/elevates an owner       | 403    | see §7 messages                                     |
| Self-deactivate / self-delete                   | 403    | `You cannot deactivate your own account`            |
| Manager changes own role                        | 403    | `You cannot change your own role`                   |
| Missing/invalid token                           | 401    | (spec `03` §8)                                       |
| Role not allowed on route (e.g. waiter)         | 403    | `You do not have permission to perform this action` |

- The 409 mapping is handled centrally by `error.middleware.js` Postgres code
  mapping (spec `05` §2.2); the service may also pre-check email and throw
  `ApiError(409, ...)` for a friendlier message, but the unique index is the
  source of truth.

## 9. List: query params, filters, sorting

`GET /api/users` (spec `05` §5). Uses `getPagination` and `buildMeta`.

- **Pagination:** `page` (default 1), `limit` (default 20, max 100).
- **Sort whitelist** (never interpolate raw client input, spec `05` §5):
  `full_name`, `email`, `role`, `is_active`, `created_at`, `last_login_at`.
  Prefix `-` for descending. Default `created_at DESC`.
- **Filters:**
  - `role` — exact match on `role` (`WHERE role = $n`).
  - `is_active` — exact match on `is_active` (`WHERE is_active = $n`).
  - `search` — case-insensitive match on name or email:
    `WHERE (full_name ILIKE '%'||$n||'%' OR email ILIKE '%'||$n||'%')`.
- All values parameterized (`$1, $2, ...`); only the sort **column identifier**
  is resolved via the whitelist.
- Two queries: `COUNT(*)` with the same WHERE, then the paged `SELECT`. Response
  carries `meta = { page, limit, total, totalPages }`.

Example: `GET /api/users?role=waiter&is_active=true&search=raj&sort=full_name&page=1&limit=20`.

## 10. Request / response examples

### 10.1 Create — `POST /api/users`

Request:

```json
{
  "full_name": "Priya Nair",
  "email": "Priya.Nair@example.com",
  "password": "changeme123",
  "role": "waiter",
  "phone": "+91 90000 11111"
}
```

Response `201`:

```json
{
  "data": {
    "id": 12,
    "full_name": "Priya Nair",
    "email": "priya.nair@example.com",
    "role": "waiter",
    "phone": "+91 90000 11111",
    "is_active": true,
    "last_login_at": null,
    "created_at": "2026-07-25T09:14:02.000Z",
    "updated_at": "2026-07-25T09:14:02.000Z"
  }
}
```

Note the email is lowercased. No `password_hash` in the response.

### 10.2 Update — `PATCH /api/users/12`

Request (partial):

```json
{
  "role": "cashier",
  "is_active": true,
  "phone": "+91 90000 22222"
}
```

Response `200`:

```json
{
  "data": {
    "id": 12,
    "full_name": "Priya Nair",
    "email": "priya.nair@example.com",
    "role": "cashier",
    "phone": "+91 90000 22222",
    "is_active": true,
    "last_login_at": null,
    "created_at": "2026-07-25T09:14:02.000Z",
    "updated_at": "2026-07-25T09:20:41.000Z"
  }
}
```

### 10.3 List — `GET /api/users?role=waiter&page=1&limit=20`

Response `200`:

```json
{
  "data": [
    {
      "id": 8,
      "full_name": "Arjun Rao",
      "email": "arjun.rao@example.com",
      "role": "waiter",
      "phone": null,
      "is_active": true,
      "last_login_at": "2026-07-24T18:02:11.000Z",
      "created_at": "2026-07-01T05:00:00.000Z",
      "updated_at": "2026-07-01T05:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### 10.4 Admin reset password — `POST /api/users/12/reset-password`

Request:

```json
{ "new_password": "temporary456" }
```

Response `200`:

```json
{ "data": { "success": true } }
```

Service hashes `new_password` with `hashPassword` (bcrypt cost 10) and updates
`users.password_hash`. It does **not** return the hash and does not require the
old password (admin flow). Ownership rules in §6 still apply (a manager cannot
reset an owner's password).

### 10.5 Deactivate — `DELETE /api/users/12`

Response `200`:

```json
{ "data": { "success": true } }
```

Sets `is_active = false`. Rejects with `403` if the id equals `req.user.id`
(self-delete guard). Reactivation is done via `PATCH { "is_active": true }`.

## 11. Service responsibilities (summary)

`Backend/src/modules/users/users.service.js`:

- `list(query)` → parameterized filters + whitelisted sort + pagination; returns
  `{ rows: rows.map(toPublicUser), meta }`.
- `getById(id)` → 404 if missing; returns `toPublicUser(row)`.
- `create(body, actor)` → run §6/§7 checks, `hashPassword(body.password)`,
  `INSERT ... RETURNING *`, map. Unique-email → 409.
- `update(id, patch, actor)` → load target (404 if missing), run
  `assertCanManage(actor, target, patch)`, build dynamic `SET` from provided keys
  only, `UPDATE ... RETURNING *`, map.
- `resetPassword(id, newPassword, actor)` → load target (404), run owner/self
  checks, `hashPassword`, update, return `{ success: true }`.
- `remove(id, actor)` → load target (404), block self-delete, block manager→owner,
  `UPDATE users SET is_active = false`, return `{ success: true }`.

Controllers stay thin (spec `05` §7): parse `req.params`/`req.body`/`req.query`,
pass `req.user` as the actor, send the envelope via `ok`/`created`.

## 12. Relationships to other specs

- **Spec `01`** — the `users` table and `uq_users_email`, `idx_users_role`.
- **Spec `02` (seed data)** — seeded users (one per role, with documented
  credentials) are the initial rows this module lists/edits. Admin reset here
  changes a seeded user's password; deactivation flips their `is_active`.
- **Spec `03` (auth)** — shares `hashPassword`/`verifyPassword` and the
  `toPublicUser` mapper. `last_login_at` is written by login, read here. This
  module is the only way to create accounts (no public signup).
- **Spec `04` (RBAC)** — the Staff/Users matrix row and the ownership/self rules
  §5 are implemented here.
- **Spec `12` (frontend pages)** — the Staff page consumes these endpoints
  (list with filters/search, create/edit modals, activate/deactivate toggle,
  admin reset-password action). Frontend gating of these controls is UX only;
  security is the §6/§7 server checks.

## 13. Acceptance checklist

- [ ] `/api/users` mounted; the `users.routes.js` stub replaced with the real
      mount (auth + `requireRole("manager")` + validate + controller).
- [ ] `GET /api/users` lists with `role`, `is_active`, `search` filters,
      whitelisted `sort`, and pagination `meta`.
- [ ] `GET /api/users/:id` returns a single user; 404 when missing.
- [ ] `POST /api/users` validates (`full_name`, `email`, `password` min 8,
      `role`, optional `phone`), lowercases email, hashes password with
      `hashPassword`, returns 201.
- [ ] `PATCH /api/users/:id` updates `full_name`/`phone`/`role`/`is_active`
      (partial); email and password are not updatable here.
- [ ] `POST /api/users/:id/reset-password` admin-resets a password (bcrypt),
      returns `{ success: true }`; no old password required.
- [ ] `DELETE /api/users/:id` soft-deletes via `is_active = false`.
- [ ] `password_hash` never appears in any response (all paths use
      `toPublicUser`).
- [ ] Duplicate email → 409; not found → 404; validation → 422.
- [ ] Manager cannot create/modify/deactivate/reset an owner → 403.
- [ ] Manager cannot elevate anyone (incl. self) to `role = 'owner'` → 403.
- [ ] No user can deactivate or delete their own account → 403.
- [ ] Manager cannot change their own role → 403.
- [ ] Non-management roles (chef/waiter/cashier/store_manager) get 403 on every
      `/api/users` route.
- [ ] Unauthorized role → 403, missing/invalid token → 401 (verified via API,
      not just the UI).
