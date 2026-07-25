# Phase 1 — Spec 04: RBAC & Roles

> The role model and the authoritative permission matrix. Replaces the no-op
> `requireRole` stub in `Backend/src/middlewares/rbac.middleware.js`. RBAC is
> enforced **server-side**; frontend gating is UX only.

## 1. Roles

From `AGENTS.md` (`user_role` enum, spec `01`):

| Role          | Intent                                                              |
|---------------|--------------------------------------------------------------------|
| owner         | Full access to everything, including staff and configuration.      |
| manager       | Nearly full operational access; manages staff except owners.       |
| chef          | Kitchen: menu/recipes/ingredients visibility, order prep updates.  |
| waiter        | Front-of-house: tables and orders.                                 |
| cashier       | Billing/payments on orders; read menu.                             |
| store_manager | Inventory, suppliers, purchase orders, stock, invoices, expenses.  |

## 2. Enforcement model

- **Authentication** (`authMiddleware`, spec `03`) runs first and sets `req.user`.
- **Authorization** (`requireRole(...roles)`) runs per route and checks
  `req.user.role` against the allowed set.
- Some endpoints also require **ownership/self** checks beyond role (see §5).
- Default deny: if a route is protected and the role is not listed as allowed →
  `403 Forbidden`. Never rely on the UI hiding a button.

### 2.1 `requireRole` implementation contract
```js
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, "Authentication required"));
    if (!allowedRoles.includes(req.user.role))
      return next(new ApiError(403, "You do not have permission to perform this action"));
    next();
  };
}
```
- `owner` is allowed everywhere. To avoid listing `owner` on every route, either
  include `'owner'` in every `requireRole` call **or** special-case owner inside
  `requireRole` (recommended: `if (req.user.role === 'owner') return next();`).
  Pick one and apply consistently. Recommended: owner bypass inside the middleware.

## 3. Permission matrix (authoritative)

Legend: **C**=create, **R**=read/list, **U**=update, **D**=delete/deactivate/cancel.
`owner` = full CRUD on everything (bypass). Blank = no access (403).

| Module / Resource        | owner | manager | chef  | waiter | cashier | store_manager |
|--------------------------|-------|---------|-------|--------|---------|---------------|
| Staff / Users            | CRUD  | CRUD*   |       |        |         |               |
| Restaurant profile/config| CRUD  | RU      | R     | R      | R       | R             |
| Tables                   | CRUD  | CRUD    | R     | RU     | R       |               |
| Menu categories          | CRUD  | CRUD    | R     | R      | R       |               |
| Menu items               | CRUD  | CRUD    | RU    | R      | R       |               |
| Recipes                  | CRUD  | CRUD    | CRUD  | R      |         |               |
| Ingredients              | CRUD  | CRUD    | RU    |        |         | CRUD          |
| Orders                   | CRUD  | CRUD    | RU‡   | CRU    | RU†     |               |
| Order payment/checkout   | CRUD  | CRUD    |       |        | CU      |               |
| Suppliers                | CRUD  | CRUD    |       |        |         | CRUD          |
| Product categories       | CRUD  | CRUD    |       |        |         | CRUD          |
| Products                 | CRUD  | CRUD    |       |        |         | CRUD          |
| Warehouses / stores      | CRUD  | CRUD    |       |        |         | CRUD          |
| Stock in / out / movements| CRUD | CRUD    |       |        |         | CRUD          |
| Purchase orders          | CRUD  | CRUD    |       |        |         | CRUD          |
| Expense categories       | CRUD  | CRUD    |       |        |         | RU            |
| Expense records          | CRUD  | CRUD    |       |        | R       | CRUD          |
| Supplier invoices        | CRUD  | CRUD    |       |        |         | CRUD          |
| Monthly expense tracking | R     | R       |       |        | R       | R             |
| Dashboard (all widgets)  | R     | R       | R§    | R§     | R§      | R§            |

Notes:
- `*` **manager** may create/update/deactivate staff of any role **except owner**;
  managers cannot create or modify owner accounts, and cannot delete themselves.
  (Ownership rule §5.)
- `†` **cashier** on Orders: read all, and update **payment fields**
  (`payment_status`, `payment_method`) + close/complete an order after payment.
  Cashier cannot add/remove order items (that is waiter/manager).
- `‡` **chef** on Orders: read the kitchen queue and update **status** along the
  kitchen path (`sent_to_kitchen` → `preparing` → `ready`). Cannot change items,
  payment, or totals.
- `§` **Dashboard** is readable by all authenticated roles, but each role sees the
  widgets relevant to it; the backend endpoints still return data (frontend may
  hide widgets per role — UX only). If a stricter cut is wanted, restrict the
  financial widgets (Profit, Monthly Expenses, Purchase Summary) to owner/manager/
  store_manager/cashier and document it. Default: all roles may read all widgets.

> This matrix is the single source of truth. Each module spec (06–10) repeats the
> relevant row in its endpoint table and must match this exactly. If a module spec
> and this matrix disagree, **this matrix wins** and the module spec is corrected.

## 4. Field-level restrictions (beyond route-level roles)

Some endpoints are reachable by a role but only for a **subset of fields**:

- **Orders** (spec `06`): cashier may `PATCH` only payment fields; chef may
  `PATCH` only `status` (kitchen transitions). Enforce in the service by ignoring
  or rejecting disallowed fields based on `req.user.role`, not just the route.
- **Staff** (spec `09`): non-owner cannot set/elevate a user to `owner`; managers
  cannot change their own role or `is_active`.
- **Menu items** (chef): chef may toggle `is_available` and edit prep/recipe-facing
  fields but not `price` (pricing is manager/owner). If this granularity is too
  fine for Phase 1, restrict chef on menu items to read-only and note it; default
  spec allows chef `RU` limited to availability.

Implement field-level checks in the service layer with a clear allow-list per
role. Keep it readable; a small `pickAllowedFields(role, body)` helper per module
is acceptable.

## 5. Ownership / self rules

- A manager cannot modify or delete an **owner** account.
- A user cannot deactivate/delete **their own** account (prevents lockout).
- `change-password` (spec `03`) always operates on `req.user` (self) regardless of
  role; admin password reset (spec `09`) is owner/manager only and cannot target an
  owner unless the actor is an owner.
- Where relevant, ownership checks live in the service and throw `ApiError(403)`.

## 6. Wiring pattern in routes

```js
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");

router.use(authMiddleware); // all routes in this module require auth
router.get("/",    requireRole("manager", "store_manager"), ctrl.list);
router.post("/",   requireRole("manager", "store_manager"), ctrl.create);
router.patch("/:id", requireRole("manager", "store_manager"), ctrl.update);
router.delete("/:id", requireRole("manager"), ctrl.remove);
```
- `owner` omitted from lists because of the owner-bypass in `requireRole` (§2.1).
- Auth is applied once per module router; role checks are per route/verb.

## 7. Testing RBAC (for the reviewer and DoD)

- For each protected endpoint, an unauthorized role must receive **403** (not 200,
  not a hidden success). This is verified server-side, e.g. via curl/Postman with a
  waiter token hitting `POST /api/products` → 403.
- Missing token → 401; valid token wrong role → 403. These two are distinct.
- Spec `13` (Definition of Done) includes an RBAC smoke matrix to run.

## 8. Acceptance for this spec

- [ ] `requireRole` implemented with default-deny + owner bypass.
- [ ] Every protected route declares its allowed roles per the matrix.
- [ ] Field-level restrictions (orders payment/status, staff role elevation)
      enforced in the service.
- [ ] Ownership/self rules enforced (no owner edits by managers, no self-delete).
- [ ] Unauthorized role → 403; missing/invalid token → 401; verified via API, not
      just UI.
