# Phase 1 — Spec 05: Backend Conventions

> Shared backend architecture every CRUD module (specs 06–10) must follow. Locks
> the module anatomy, validation, error handling, response envelope, pagination,
> and DB/transaction patterns so all modules look and behave the same.

## 1. Module anatomy

Each module lives in `Backend/src/modules/<name>/`:

```
<name>.routes.js       # mount(parentRouter): wires authMiddleware + requireRole + controller
<name>.controller.js   # HTTP layer only: read req, call service, send envelope
<name>.service.js      # business logic + SQL via pool; transactions; throws ApiError
<name>.validation.js   # Zod schemas: createSchema, updateSchema, querySchema
<name>.repository.js    # OPTIONAL: extract SQL if service exceeds ~300 lines
```

Rules:
- Controllers contain **no SQL** and **no business rules** — parse, delegate,
  respond.
- Services contain SQL and rules. Split into `repository.js` if a file nears
  300–400 lines (AGENTS.md).
- Routes only wire middleware + controller methods. No logic.
- Existing `*.routes.js` stubs return `{ module, status: "pending" }`; replace them
  with the real mount using the pattern below.

### 1.1 Route mount pattern (matches existing `routes.js`)
```js
const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const ctrl = require("./<name>.controller");

function mount<Name>Routes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/",     requireRole(...), ctrl.list);
  router.get("/:id",  requireRole(...), ctrl.getById);
  router.post("/",    requireRole(...), ctrl.create);
  router.patch("/:id",requireRole(...), ctrl.update);
  router.delete("/:id",requireRole(...), ctrl.remove);

  parentRouter.use("/<name>", router);
}
module.exports = mount<Name>Routes;
```
`Backend/src/routes.js` already imports and calls each module's mount function.
Keep that list in sync.

## 2. Async handler & error flow

`Backend/src/utils/async-handler.js` — wraps async controllers so thrown errors
reach the error middleware:
```js
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
module.exports = { asyncHandler };
```
- Every controller method is wrapped: `exports.list = asyncHandler(async (req,res)=>{...})`.
- Services throw `ApiError(status, message)` (or the validation layer throws). The
  central `error.middleware.js` formats the response.

### 2.1 `ApiError` (extend existing)
Current `api-error.js` has `statusCode` + `message`. Extend to carry optional
field errors for validation:
```js
class ApiError extends Error {
  constructor(statusCode, message, errors = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors; // [{ field, message }] for 422
  }
}
```

### 2.2 Error middleware (extend existing)
`error.middleware.js` must:
- Use `error.statusCode || 500`.
- Include `errors` array when present (validation).
- Map known Postgres error codes to friendly messages:
  - `23505` unique_violation → 409 Conflict ("… already exists").
  - `23503` foreign_key_violation → 409/400 ("Referenced record not found / in use").
  - `23514` check_violation → 422.
  - `22P02` invalid_text_representation (bad id/enum) → 400.
- Never leak stack traces or raw SQL to the client. Log full error server-side
  (console in dev); return the friendly `message` only.

## 3. Validation with Zod

- `<name>.validation.js` exports `createSchema`, `updateSchema` (partial of
  create where sensible), and `querySchema` (pagination + filters).
- A shared middleware `Backend/src/middlewares/validate.middleware.js`:
  ```js
  const validate = (schema, source = "body") => (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.issues.map(i => ({ field: i.path.join("."), message: i.message }));
      return next(new ApiError(422, "Validation failed", errors));
    }
    req[source] = result.data; // use parsed/coerced values
    next();
  };
  ```
- Wire in routes: `router.post("/", requireRole(...), validate(createSchema), ctrl.create)`.
- Coerce query numbers (`page`, `limit`) with `z.coerce.number()`.
- Reject unknown body keys with `.strict()` where appropriate (prevents mass
  assignment). Field-level RBAC (spec `04` §4) is still enforced in the service.

## 4. Response envelope helpers

`Backend/src/utils/respond.js` (small, optional but recommended):
```js
const ok = (res, data, meta) => res.json(meta ? { data, meta } : { data });
const created = (res, data) => res.status(201).json({ data });
const noContent = (res) => res.status(204).send();
```
- Single resource → `{ data: {...} }`.
- Collection → `{ data: [...], meta: { page, limit, total, totalPages } }`.
- Creates → 201 with `{ data }`. Updates → 200 with `{ data }`. Deletes → 200
  `{ data: { success: true } }` or 204 (be consistent; recommend 200 + body so the
  frontend can toast).

## 5. Pagination / sort / filter

`Backend/src/utils/pagination.js` provides:
```js
// parse from validated query
function getPagination(query) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
function buildMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
```
- List services run two queries: a `COUNT(*)` (with the same WHERE) and the paged
  `SELECT ... LIMIT $ OFFSET $`, then return `{ rows, total }`.
- **Sorting:** accept `sort` like `created_at` or `-created_at` (desc). Whitelist
  sortable columns per module (never interpolate raw client input into ORDER BY).
  Map to `ORDER BY <col> <ASC|DESC>` using a per-module allow-list; default
  `created_at DESC`.
- **Filtering:** each module declares its filters in `querySchema` (e.g. `status`,
  `search`, `category_id`). `search` does `ILIKE '%'||$1||'%'` on named columns.
- **All values via parameterized queries** (`$1, $2, ...`). Never string-concat
  user input into SQL. Whitelisting applies only to column identifiers for sort.

## 6. Database access & transactions

- Use the shared `pool` from `config/database.js`. `pool.query(text, params)` for
  single statements.
- **Transactions** for any multi-statement write that must be atomic (orders with
  items, PO receiving + stock movement + stock balance, invoice with line items):
  ```js
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // ... multiple queries via client.query(...)
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  ```
- Provide a helper `Backend/src/utils/with-transaction.js` (`withTransaction(fn)`)
  so services don't repeat the boilerplate:
  ```js
  async function withTransaction(fn) {
    const client = await pool.connect();
    try { await client.query("BEGIN"); const r = await fn(client); await client.query("COMMIT"); return r; }
    catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  }
  ```
- Row mapping: SQL returns snake_case; API returns snake_case too (keep it simple,
  no camelCase transform layer in Phase 1). Frontend consumes snake_case. Be
  consistent across all modules.
- Money/quantity numerics: `pg` returns `numeric` as strings. Decide once: return
  them as-is (strings) or `Number(...)`-cast in the mapper. Recommended: cast money
  and quantities to numbers in the service mapper for clean JSON, accepting JS
  float display (values are small). Document the choice; apply everywhere.

## 7. Standard CRUD controller shape

```js
const { asyncHandler } = require("../../utils/async-handler");
const svc = require("./<name>.service");
const { ok, created } = require("../../utils/respond");

exports.list = asyncHandler(async (req, res) => {
  const { rows, meta } = await svc.list(req.query);
  ok(res, rows, meta);
});
exports.getById = asyncHandler(async (req, res) => {
  ok(res, await svc.getById(req.params.id)); // service throws 404 if missing
});
exports.create = asyncHandler(async (req, res) => {
  created(res, await svc.create(req.body, req.user));
});
exports.update = asyncHandler(async (req, res) => {
  ok(res, await svc.update(req.params.id, req.body, req.user));
});
exports.remove = asyncHandler(async (req, res) => {
  ok(res, await svc.remove(req.params.id, req.user));
});
```
- `req.user` is passed to the service for `created_by`, field-level RBAC, and
  ownership checks.
- `getById`/`update`/`remove` throw `ApiError(404, "<Resource> not found")` when
  the id does not exist.

## 8. HTTP status conventions

| Action                         | Status |
|--------------------------------|--------|
| List / get / update success    | 200    |
| Create success                 | 201    |
| Delete success                 | 200 (with `{success:true}`) or 204 |
| Validation failure             | 422    |
| Missing/invalid auth           | 401    |
| Role/ownership denied          | 403    |
| Resource not found             | 404    |
| Unique/constraint conflict     | 409    |
| Unhandled                      | 500    |

## 9. Cross-cutting middleware application

- `authMiddleware` applied per module router (`router.use(authMiddleware)`), so
  every module route requires a token except `POST /api/auth/login`.
- `validate(...)` applied per write route.
- `requireRole(...)` applied per route per the matrix in spec `04`.

## 10. File-size & style discipline (AGENTS.md)

- Split any file over ~300–400 lines.
- Comments only for non-obvious business logic / failure handling; no restating
  code; no em dashes in comments.
- No premature abstraction; no unrelated refactors. Introduce `repository.js`,
  helpers, etc. only when a file actually needs splitting.

## 11. Shared utilities checklist (implement once, reuse everywhere)

- [ ] `utils/async-handler.js`
- [ ] `utils/api-error.js` (extended with `errors`)
- [ ] `utils/respond.js`
- [ ] `utils/pagination.js`
- [ ] `utils/with-transaction.js`
- [ ] `utils/jwt.js`, `utils/password.js` (spec `03`)
- [ ] `middlewares/validate.middleware.js`
- [ ] `middlewares/auth.middleware.js` (spec `03`), `rbac.middleware.js` (spec `04`)
- [ ] `middlewares/error.middleware.js` (extended, Postgres code mapping)

## 12. Acceptance for this spec

- [ ] Every module follows routes/controller/service/validation split.
- [ ] All writes validated with Zod; 422 envelope on failure.
- [ ] All list endpoints paginate + sort (whitelisted) + filter, returning `meta`.
- [ ] Multi-statement writes are transactional.
- [ ] Errors flow through central middleware with friendly messages and correct
      status codes (incl. Postgres constraint mapping). No SQL/stack leaks.
- [ ] No raw client input concatenated into SQL anywhere.
