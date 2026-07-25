# Phase 1 — Spec 06: Restaurant Operations Modules (Tables, Menu, Orders, Recipes)

> Backend CRUD specification for the four front-of-house modules. Depends on spec
> `01` (table/column names, enums, constraints — referenced verbatim here), spec
> `04` (permission matrix rows copied exactly), and spec `05` (module anatomy,
> `{ data, meta }` envelope, Zod validation, pagination, `withTransaction`, error
> mapping). Where this spec and the spec `04` matrix disagree, the matrix wins.

## 0. Scope and shared conventions

This spec owns four modules and their tables (all from spec `01` §5.2):

| Module  | Tables owned                          |
|---------|---------------------------------------|
| Tables  | `restaurant_tables`                   |
| Menu    | `menu_categories`, `menu_items`       |
| Orders  | `orders`, `order_items`               |
| Recipes | `recipes`, `recipe_ingredients`       |

All modules follow spec `05`:

- Base path `/api`; routes mounted per module (`/api/tables`, `/api/menu-categories`,
  `/api/menu-items`, `/api/orders`, `/api/recipes`).
- `router.use(authMiddleware)` on every module router; `requireRole(...)` per
  route/verb per the matrix; `owner` omitted from lists (owner-bypass in
  `requireRole`, spec `04` §2.1).
- Every write route runs `validate(schema, source)` before the controller.
- Success envelope: single resource `{ data: {...} }`; collection
  `{ data: [...], meta: { page, limit, total, totalPages } }`.
- Creates → 201, reads/updates → 200, deletes → 200 `{ data: { success: true } }`.
- Money is `numeric(12,2)`, quantities `numeric(12,3)`; the service mapper casts
  numerics to JS numbers for clean JSON (spec `05` §6). Field names are snake_case
  in and out.
- Multi-statement writes use `withTransaction(fn)` from `utils/with-transaction.js`.
- Postgres error mapping (spec `05` §2.2): `23505` → 409, `23503` → 409/400,
  `23514` → 422, `22P02` → 400.

Pagination defaults (spec `05` §5): `page` default 1, `limit` default 20 / max 100,
`sort` accepts `col` or `-col` (desc) restricted to a per-module whitelist, default
`created_at DESC`.

---

## 1. Tables module (`restaurant_tables`)

### 1.1 Purpose and owned columns

Manages physical dining tables and their live status. Waiters read and update table
status; managers/owners do full CRUD. Table status is coupled to dine-in orders
(§3.9). Columns owned (spec `01` §5.2 `restaurant_tables`):

| Column     | Type            | Notes (verbatim from spec 01)                    |
|------------|-----------------|--------------------------------------------------|
| id         | bigint identity | PK                                               |
| label      | text            | NOT NULL, UNIQUE (`uq_restaurant_tables_label`)  |
| capacity   | int             | NOT NULL, CHECK (capacity > 0)                   |
| section    | text            | NULL (e.g. 'Indoor', 'Patio', 'Bar')             |
| status     | table_status    | NOT NULL DEFAULT 'available'                     |

`table_status` enum: `'available' | 'occupied' | 'reserved' | 'out_of_service'`.
Index `idx_restaurant_tables_status`.

### 1.2 Endpoints

Matrix row (spec `04`): **Tables — owner CRUD, manager CRUD, chef R, waiter RU,
cashier R, store_manager (none)**.

| METHOD | Path                     | Description                       | Allowed roles                                   | Success |
|--------|--------------------------|-----------------------------------|-------------------------------------------------|---------|
| GET    | /api/tables              | List tables (paginate/filter)     | owner, manager, chef, waiter, cashier           | 200     |
| GET    | /api/tables/:id          | Get one table                     | owner, manager, chef, waiter, cashier           | 200     |
| POST   | /api/tables              | Create a table                    | owner, manager                                  | 201     |
| PATCH  | /api/tables/:id          | Update a table (waiter: status)   | owner, manager, waiter                          | 200     |
| DELETE | /api/tables/:id          | Delete a table (hard delete)      | owner, manager                                  | 200     |

Field-level rule (spec `04` §4): waiter reaching `PATCH` may set only `status`
(front-of-house occupancy). Manager/owner may set any field. Enforce in the service
via `pickAllowedFields(role, body)`.

### 1.3 List query params

- `page`, `limit`, `sort` (whitelist: `label`, `capacity`, `status`, `created_at`;
  default `created_at DESC`... actually default `label ASC` is friendlier for a
  floor plan — default `created_at DESC` per spec `05`, `sort=label` for floor view).
- `status` — filter by `table_status` enum value.
- `section` — exact match on `section`.
- `search` — `ILIKE` on `label`.

### 1.4 Create / update body (Zod)

`createSchema` (`.strict()`):

```js
{
  label:    z.string().trim().min(1).max(50),        // required, unique
  capacity: z.coerce.number().int().min(1),          // CHECK capacity > 0
  section:  z.string().trim().max(50).optional().nullable(),
  status:   z.enum(['available','occupied','reserved','out_of_service']).optional(), // default 'available'
}
```

`updateSchema` = `createSchema.partial().strict()` (all fields optional; at least one
required — reject empty body with 422).

### 1.5 Examples

Create request `POST /api/tables`:

```json
{ "label": "T-12", "capacity": 4, "section": "Patio" }
```

Response `201`:

```json
{ "data": { "id": 12, "label": "T-12", "capacity": 4, "section": "Patio", "status": "available", "created_at": "2026-07-25T10:00:00.000Z", "updated_at": "2026-07-25T10:00:00.000Z" } }
```

List response `GET /api/tables?status=occupied&page=1&limit=20`:

```json
{ "data": [ { "id": 12, "label": "T-12", "capacity": 4, "section": "Patio", "status": "occupied" } ], "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 } }
```

### 1.6 Business rules and edge cases

- `label` is unique (`uq_restaurant_tables_label`): duplicate → `23505` → **409**.
- `capacity` must be `> 0` (CHECK) → validated at 422 by Zod; DB `23514` → 422 as a
  backstop.
- DELETE is a **hard delete** (`restaurant_tables` is not in the soft-delete list in
  spec `01` §1.4). A table referenced by orders has FK
  `orders.table_id ... ON DELETE SET NULL`, so deletion nulls historical orders'
  `table_id` rather than blocking. Reject deletion if the table currently has an
  **open/active** dine-in order (status not in `completed`/`cancelled`) → **409**
  ("Table has active orders").
- Setting `status = 'occupied'` manually is allowed but the normal path is via order
  coupling (§3.9). Do not auto-free a table on `PATCH` alone.

### 1.7 Errors

- 404: id not found (`getById`/`update`/`remove`).
- 409: duplicate `label`; delete with active order.
- 422: bad `capacity`, unknown enum `status`, empty update body, unknown keys.

---

## 2. Menu module (`menu_categories` + `menu_items`)

### 2.1 Purpose and owned columns

Two related resources: categories group items; items are the sellable products
referenced by orders and recipes. Both are **soft-delete** entities (spec `01` §1.4).

`menu_categories` (spec `01` §5.2):

| Column      | Type            | Notes                                        |
|-------------|-----------------|----------------------------------------------|
| id          | bigint identity | PK                                           |
| name        | text            | NOT NULL, UNIQUE (`uq_menu_categories_name`) |
| description | text            | NULL                                         |
| sort_order  | int             | NOT NULL DEFAULT 0                           |
| is_active   | boolean         | NOT NULL DEFAULT true                        |

`menu_items` (spec `01` §5.2):

| Column            | Type            | Notes                                                    |
|-------------------|-----------------|----------------------------------------------------------|
| id                | bigint identity | PK                                                       |
| category_id       | bigint          | NOT NULL, FK → menu_categories(id) ON DELETE RESTRICT    |
| name              | text            | NOT NULL                                                 |
| description       | text            | NULL                                                     |
| price             | numeric(12,2)   | NOT NULL, CHECK (price >= 0)                             |
| cost              | numeric(12,2)   | NULL                                                     |
| prep_time_minutes | int             | NULL, CHECK (prep_time_minutes >= 0)                    |
| is_available      | boolean         | NOT NULL DEFAULT true                                    |
| image_url         | text            | NULL                                                     |

Unique `uq_menu_items_category_name` on `(category_id, name)`. Indexes
`idx_menu_items_category_id`, `idx_menu_items_is_available`.

### 2.2 Endpoints — menu categories

Matrix row (spec `04`): **Menu categories — owner CRUD, manager CRUD, chef R,
waiter R, cashier R, store_manager (none)**.

| METHOD | Path                       | Description                    | Allowed roles                          | Success |
|--------|----------------------------|--------------------------------|----------------------------------------|---------|
| GET    | /api/menu-categories       | List categories                | owner, manager, chef, waiter, cashier  | 200     |
| GET    | /api/menu-categories/:id   | Get one category (+ items opt) | owner, manager, chef, waiter, cashier  | 200     |
| POST   | /api/menu-categories       | Create category                | owner, manager                         | 201     |
| PATCH  | /api/menu-categories/:id   | Update category                | owner, manager                         | 200     |
| DELETE | /api/menu-categories/:id   | Deactivate category (soft)     | owner, manager                         | 200     |

### 2.3 Endpoints — menu items

Matrix row (spec `04`): **Menu items — owner CRUD, manager CRUD, chef RU, waiter R,
cashier R, store_manager (none)**.

| METHOD | Path                          | Description                          | Allowed roles                          | Success |
|--------|-------------------------------|--------------------------------------|----------------------------------------|---------|
| GET    | /api/menu-items               | List items (filter category/avail)   | owner, manager, chef, waiter, cashier  | 200     |
| GET    | /api/menu-items/:id           | Get one item                         | owner, manager, chef, waiter, cashier  | 200     |
| POST   | /api/menu-items               | Create item                          | owner, manager                         | 201     |
| PATCH  | /api/menu-items/:id           | Update item (chef: availability only)| owner, manager, chef                   | 200     |
| PATCH  | /api/menu-items/:id/availability | Toggle `is_available`             | owner, manager, chef                   | 200     |
| DELETE | /api/menu-items/:id           | Deactivate item (soft)               | owner, manager                         | 200     |

Field-level rule (spec `04` §4): **chef** on `PATCH /api/menu-items/:id` may edit
only availability/prep-facing fields (`is_available`, `prep_time_minutes`), never
`price` (pricing is manager/owner). Enforce in the service allow-list; reject or
strip disallowed fields for chef. The dedicated `/availability` route is the clean
chef path.

### 2.4 List query params

Categories: `page`, `limit`, `sort` (whitelist: `name`, `sort_order`, `created_at`;
default `sort_order ASC, name ASC`), `search` (`ILIKE` on `name`), `is_active`
(default excludes deactivated unless `is_active=false`/`all`).

Items: `page`, `limit`, `sort` (whitelist: `name`, `price`, `created_at`), plus
filters:
- `category_id` — filter to one category.
- `is_available` — boolean.
- `is_active` — boolean (default active only).
- `search` — `ILIKE` on `name`.

### 2.5 Create / update body (Zod)

Category `createSchema` (`.strict()`):

```js
{
  name:        z.string().trim().min(1).max(80),   // required, unique
  description: z.string().trim().max(500).optional().nullable(),
  sort_order:  z.coerce.number().int().min(0).optional(), // default 0
  is_active:   z.boolean().optional(),             // default true
}
```

Item `createSchema` (`.strict()`):

```js
{
  category_id:       z.coerce.number().int().positive(),          // required, FK
  name:              z.string().trim().min(1).max(120),           // required
  description:       z.string().trim().max(1000).optional().nullable(),
  price:             z.coerce.number().min(0),                    // CHECK price >= 0
  cost:              z.coerce.number().min(0).optional().nullable(),
  prep_time_minutes: z.coerce.number().int().min(0).optional().nullable(), // CHECK >= 0
  is_available:      z.boolean().optional(),                      // default true
  image_url:         z.string().trim().url().max(500).optional().nullable(),
}
```

`updateSchema` = `createSchema.partial().strict()` for each (non-empty).

Availability toggle body (`PATCH /api/menu-items/:id/availability`):

```js
{ is_available: z.boolean() }  // required
```

### 2.6 Examples

Create item `POST /api/menu-items`:

```json
{ "category_id": 3, "name": "Margherita Pizza", "price": 320.00, "prep_time_minutes": 15 }
```

Response `201`:

```json
{ "data": { "id": 45, "category_id": 3, "name": "Margherita Pizza", "description": null, "price": 320, "cost": null, "prep_time_minutes": 15, "is_available": true, "image_url": null, "created_at": "2026-07-25T10:05:00.000Z", "updated_at": "2026-07-25T10:05:00.000Z" } }
```

Category with items `GET /api/menu-categories/3?include=items`:

```json
{ "data": { "id": 3, "name": "Pizzas", "description": "Wood-fired", "sort_order": 1, "is_active": true, "items": [ { "id": 45, "name": "Margherita Pizza", "price": 320, "is_available": true } ] } }
```

### 2.7 Business rules and edge cases

- Category `name` unique (`uq_menu_categories_name`) → duplicate `23505` → **409**.
- Item unique on `(category_id, name)` (`uq_menu_items_category_name`) → duplicate
  `23505` → **409**.
- `price >= 0` and `prep_time_minutes >= 0` (CHECKs) validated by Zod (422); DB
  `23514` → 422 backstop. Negative price → 422 with field error.
- Item `category_id` must reference an existing category; FK
  `ON DELETE RESTRICT`. Missing category on create → FK `23503` → **409/400**
  ("Referenced record not found").
- **Deactivate vs delete (soft delete, spec `01` §1.4):** `DELETE` on category and
  item sets `is_active = false`; it does **not** hard-delete. This preserves
  historical order references (`order_items` snapshot name/price anyway). A
  deactivated category with items: block deactivation only if you want to force
  moving items first — default: deactivating a category does **not** cascade to
  items but hides it from active menu listings; document that active items under an
  inactive category are still historically valid. Deleting (deactivating) a category
  that still has **active** items → **409** ("Deactivate or move items first").
- `is_available` toggle is a lightweight, high-frequency operation (86'd items);
  keep it a single-column update. It is distinct from `is_active` (menu presence):
  `is_available=false` means temporarily out of stock; `is_active=false` means
  removed from the menu.
- Orders may only add items where `is_active = true` AND `is_available = true`
  (enforced in Orders service, §3.6).

### 2.8 Errors

- 404: category/item id not found.
- 409: duplicate name / `(category_id, name)`; FK to missing category; deactivate
  category with active items.
- 422: negative price/prep time, bad `category_id` type, unknown keys, empty body.

---

## 3. Orders module (`orders` + `order_items`)

### 3.1 Purpose and owned columns

The transactional heart of front-of-house. An order aggregates snapshotted line
items, moves through a kitchen/service lifecycle, is paid at checkout, and (for
dine-in) couples to a table's occupancy. Totals are **always recomputed
server-side** from `order_items` and `restaurant_profile.tax_rate`; client-supplied
totals are ignored.

`orders` (spec `01` §5.2):

| Column          | Type            | Notes                                                    |
|-----------------|-----------------|----------------------------------------------------------|
| id              | bigint identity | PK                                                       |
| order_number    | text            | NOT NULL, UNIQUE (`uq_orders_order_number`), `ORD-2026-000123` |
| table_id        | bigint          | NULL, FK → restaurant_tables(id) ON DELETE SET NULL      |
| order_type      | order_type      | NOT NULL DEFAULT 'dine_in'                               |
| status          | order_status    | NOT NULL DEFAULT 'open'                                  |
| waiter_id       | bigint          | NULL, FK → users(id) ON DELETE SET NULL                  |
| subtotal        | numeric(12,2)   | NOT NULL DEFAULT 0 (recomputed)                          |
| tax             | numeric(12,2)   | NOT NULL DEFAULT 0 (recomputed)                          |
| discount        | numeric(12,2)   | NOT NULL DEFAULT 0                                       |
| total           | numeric(12,2)   | NOT NULL DEFAULT 0 (recomputed)                          |
| payment_status  | payment_status  | NOT NULL DEFAULT 'unpaid'                                |
| payment_method  | payment_method  | NULL                                                     |
| notes           | text            | NULL                                                     |
| placed_at       | timestamptz     | NULL (set when leaving 'open')                          |
| completed_at    | timestamptz     | NULL (set when status → completed)                      |

`order_items` (spec `01` §5.2):

| Column        | Type            | Notes                                                    |
|---------------|-----------------|----------------------------------------------------------|
| id            | bigint identity | PK                                                       |
| order_id      | bigint          | NOT NULL, FK → orders(id) ON DELETE CASCADE              |
| menu_item_id  | bigint          | NOT NULL, FK → menu_items(id) ON DELETE RESTRICT         |
| item_name     | text            | NOT NULL (snapshot of menu item name at order time)      |
| quantity      | int             | NOT NULL, CHECK (quantity > 0)                          |
| unit_price    | numeric(12,2)   | NOT NULL (snapshot of price at order time)               |
| line_total    | numeric(12,2)   | NOT NULL (quantity * unit_price)                         |
| notes         | text            | NULL                                                     |

Enums: `order_type` = `dine_in | takeaway | delivery`; `order_status` =
`open | sent_to_kitchen | preparing | ready | served | completed | cancelled`;
`payment_status` = `unpaid | paid | refunded`; `payment_method` =
`cash | card | upi | bank_transfer | other`. Indexes `idx_orders_status`,
`idx_orders_table_id`, `idx_orders_created_at`, `idx_orders_payment_status`,
`idx_order_items_order_id`.

### 3.2 Endpoints

Matrix rows (spec `04`): **Orders — owner CRUD, manager CRUD, chef RU‡, waiter CRU,
cashier RU†, store_manager (none)**. **Order payment/checkout — owner CRUD, manager
CRUD, cashier CU** (chef/waiter/store_manager none).

| METHOD | Path                              | Description                                  | Allowed roles                          | Success |
|--------|-----------------------------------|----------------------------------------------|----------------------------------------|---------|
| GET    | /api/orders                       | List orders (filter status/table/payment)    | owner, manager, chef, waiter, cashier  | 200     |
| GET    | /api/orders/:id                   | Get one order with items                     | owner, manager, chef, waiter, cashier  | 200     |
| POST   | /api/orders                       | Create order (optionally with items)         | owner, manager, waiter                 | 201     |
| PATCH  | /api/orders/:id                   | Update order header (notes/discount/table)   | owner, manager, waiter                 | 200     |
| PATCH  | /api/orders/:id/status            | Transition status (kitchen/service path)     | owner, manager, chef, waiter           | 200     |
| POST   | /api/orders/:id/payment           | Take payment / checkout                      | owner, manager, cashier                | 200     |
| DELETE | /api/orders/:id                   | Cancel order (status → cancelled)            | owner, manager                         | 200     |
| GET    | /api/orders/:id/items             | List items of an order                       | owner, manager, chef, waiter, cashier  | 200     |
| POST   | /api/orders/:id/items             | Add an item (nested resource)                | owner, manager, waiter                 | 201     |
| PATCH  | /api/orders/:id/items/:itemId     | Update an item (quantity/notes)              | owner, manager, waiter                 | 200     |
| DELETE | /api/orders/:id/items/:itemId     | Remove an item                               | owner, manager, waiter                 | 200     |

Field-level enforcement (spec `04` §4, notes `†` and `‡`):

- **chef** (`‡`): may read the kitchen queue and use only `PATCH /:id/status` along
  the kitchen path (`sent_to_kitchen → preparing → ready`). Chef cannot change items,
  header fields, payment, or totals. Chef is **not** in the allowed roles for
  `POST/PATCH/DELETE /items`, `PATCH /:id` header, or `/payment`.
- **cashier** (`†`): read all orders; via `POST /:id/payment` update only
  `payment_status`, `payment_method`, and close/complete the order after payment.
  Cashier cannot add/remove items and is not allowed on `POST /orders`, `PATCH /:id`
  header, or item routes.
- **waiter**: create orders, edit header (notes/discount/table_id), manage items,
  and drive the service-side status transitions (`ready → served`,
  `open → sent_to_kitchen`). Cannot take payment.

### 3.3 Order lifecycle and status transitions

`order_status` path (spec `01` enum order = authoritative):

```
open -> sent_to_kitchen -> preparing -> ready -> served -> completed
  \____________________________________________________________/
                         -> cancelled (from any non-completed state)
```

Allowed transitions and who may perform each (`PATCH /:id/status`):

| From             | To               | Allowed roles              | Side effects                                              |
|------------------|------------------|----------------------------|----------------------------------------------------------|
| open             | sent_to_kitchen  | owner, manager, waiter     | set `placed_at = now()`; recompute totals; require >=1 item |
| sent_to_kitchen  | preparing        | owner, manager, chef       | none                                                     |
| preparing        | ready            | owner, manager, chef       | none                                                     |
| ready            | served           | owner, manager, waiter     | none                                                     |
| served           | completed        | owner, manager             | set `completed_at = now()`; requires `payment_status='paid'`; free table (§3.9) |
| any (not completed) | cancelled     | owner, manager             | set nothing paid; free table (§3.9); no stock effects   |

Rules:

- Transitions are **strictly forward** along the chain (plus `cancelled`). Backward
  or skipping transitions → **409** ("Invalid status transition <from> -> <to>").
- `completed` is terminal; `cancelled` is terminal. Any transition out of a terminal
  state → **409**.
- Completing an order requires `payment_status = 'paid'` (checkout must have run) →
  else **409** ("Order must be paid before completion"). Owner/manager perform the
  final `served → completed`; the cashier's `/payment` call may auto-advance to
  `completed` when configured (§3.8).
- Chef restricted to the middle of the chain (`sent_to_kitchen → preparing → ready`);
  any other transition by a chef → **403** (field-level, spec `04` `‡`).

### 3.4 Server-side total recomputation (never trust client)

On every mutation that affects lines or discount (create with items, add/update/
remove item, header discount change, checkout), the service recomputes inside the
transaction:

```
subtotal = SUM(order_items.line_total)                     -- line_total = quantity * unit_price
tax      = round( (subtotal - discount) * (profile.tax_rate / 100), 2 )
total    = round( (subtotal - discount) + tax, 2 )
```

- `restaurant_profile.tax_rate` (percent, e.g. `5.00`) is read from the single
  profile row (spec `01` §5.1). Never hardcode the rate.
- `discount` is the only client-supplied money field (a header value, `>= 0`, and
  `<= subtotal`); `subtotal`, `tax`, `total` are computed and any client-sent values
  for them are **ignored/stripped** by the Zod schema (they are not accepted keys).
- Guard: `discount` may not exceed `subtotal` → else **422** ("Discount exceeds
  subtotal").
- Money rounding is half-up to 2 decimals; store as `numeric(12,2)`.

### 3.5 `order_number` generation

Format: `ORD-YYYY-NNNNNN` (e.g. `ORD-2026-000123`), zero-padded 6-digit sequence per
calendar year. Generated in the service inside the create transaction:

- Compute `YYYY` from `now()` in the profile timezone.
- Take the next sequence for that year (e.g. a per-year counter table, or
  `SELECT max(...)` on `order_number` for the year `FOR UPDATE`, or a dedicated
  Postgres sequence). Must be collision-safe under concurrency; on `uq_orders_order_number`
  `23505`, retry once. Persist to `orders.order_number`.

### 3.6 Adding items — snapshotting

When an item is added (`POST /:id/items` or inline on create), the service:

1. Loads the referenced `menu_items` row; rejects if not found (**404**), or if
   `is_active = false` or `is_available = false` (**409** "Item not available").
2. Snapshots `item_name = menu_items.name` and `unit_price = menu_items.price` into
   `order_items` (spec `01`: price/name snapshotted so historical orders are stable
   if the menu changes). Client cannot override `item_name`/`unit_price`.
3. Sets `line_total = quantity * unit_price`.
4. Recomputes order totals (§3.4).

Items may be added/updated/removed only while the order is in a **mutable** state
(`open`, `sent_to_kitchen`, `preparing`) — once `served`/`completed`/`cancelled`,
item mutations → **409** ("Order is not editable in status <status>"). (Adjust the
mutable window per venue policy; default: editable up to `ready`.)

### 3.7 Request bodies (Zod)

Order `createSchema` (`.strict()`):

```js
{
  order_type: z.enum(['dine_in','takeaway','delivery']).optional(), // default dine_in
  table_id:   z.coerce.number().int().positive().optional().nullable(), // required-ish for dine_in
  waiter_id:  z.coerce.number().int().positive().optional().nullable(), // default req.user.id if waiter
  discount:   z.coerce.number().min(0).optional(),                  // default 0
  notes:      z.string().trim().max(1000).optional().nullable(),
  items:      z.array(orderItemInput).optional(),                   // optional inline items
}
// subtotal/tax/total/order_number/status/payment_* are NOT accepted here.
```

`orderItemInput` / `POST /:id/items` body:

```js
{
  menu_item_id: z.coerce.number().int().positive(),   // required
  quantity:     z.coerce.number().int().min(1),       // CHECK quantity > 0
  notes:        z.string().trim().max(500).optional().nullable(),
}
// item_name, unit_price, line_total are snapshotted server-side, NOT accepted.
```

Order header `updateSchema` (`PATCH /:id`, `.strict()`, non-empty):

```js
{
  table_id: z.coerce.number().int().positive().optional().nullable(),
  discount: z.coerce.number().min(0).optional(),
  notes:    z.string().trim().max(1000).optional().nullable(),
  order_type: z.enum(['dine_in','takeaway','delivery']).optional(),
}
```

Status transition (`PATCH /:id/status`):

```js
{ status: z.enum(['open','sent_to_kitchen','preparing','ready','served','completed','cancelled']) }
```

Item update (`PATCH /:id/items/:itemId`):

```js
{
  quantity: z.coerce.number().int().min(1).optional(),
  notes:    z.string().trim().max(500).optional().nullable(),
}
```

Payment (`POST /:id/payment`), see §3.8:

```js
{
  payment_method: z.enum(['cash','card','upi','bank_transfer','other']), // required
  payment_status: z.enum(['unpaid','paid','refunded']).optional(),       // default 'paid'
  complete:       z.boolean().optional(),                                // auto-advance to completed
}
// amounts are derived from recomputed total; client cannot set amount.
```

Dine-in rule: `order_type = 'dine_in'` requires a `table_id` → else **422**
("table_id required for dine_in"). Takeaway/delivery must have `table_id = null`.

### 3.8 Payment / checkout flow (cashier)

`POST /api/orders/:id/payment` (cashier + owner/manager). In one transaction:

1. Load order; reject if `cancelled` (**409**) or already `payment_status='paid'`
   without a refund flow (**409** "Already paid").
2. Recompute totals (§3.4) so the charged `total` is authoritative.
3. Set `payment_method` and `payment_status` (default `'paid'`). Cashier may set only
   these two fields (spec `04` `†`); any other field in the body → **403**/ignored.
4. If `complete = true` (or venue default) and order status is `served`/`ready`,
   auto-advance `status → completed`, set `completed_at`, and free the table (§3.9).
   If the order is not yet `served`, either advance to `served` first or leave status
   unchanged and require a later `served → completed` — default: payment does not
   force-advance past `served`; it only sets `completed` when already `served`.
5. `refunded`: allowed only from `paid`; sets `payment_status='refunded'`. Does not
   by itself cancel the order.

### 3.9 Table status coupling

- Creating (or setting `table_id` on) a **dine_in** order marks the referenced
  `restaurant_tables.status = 'occupied'` in the same transaction.
- Completing or cancelling a dine_in order frees the table:
  `restaurant_tables.status = 'available'` (only if no other active dine_in order
  references it — check for remaining open orders on that table before freeing).
- Reassigning `table_id` (header `PATCH`) frees the old table (if no other active
  order holds it) and occupies the new one, atomically.
- Takeaway/delivery orders never touch table status.

### 3.10 Transaction requirements

Use `withTransaction` (spec `05` §6) for: create-with-items, add/update/remove item,
status transition with side effects, payment/checkout, and cancel. Each must be
atomic: order row + `order_items` + recomputed totals + table status must all commit
or roll back together. Order-number allocation happens inside the create transaction.

### 3.11 Examples

Create with inline items `POST /api/orders`:

```json
{ "order_type": "dine_in", "table_id": 12, "items": [ { "menu_item_id": 45, "quantity": 2 }, { "menu_item_id": 51, "quantity": 1, "notes": "no onion" } ] }
```

Response `201` (tax_rate = 5.00; subtotal 320*2 + 180 = 820):

```json
{
  "data": {
    "id": 987,
    "order_number": "ORD-2026-000123",
    "table_id": 12,
    "order_type": "dine_in",
    "status": "open",
    "waiter_id": 7,
    "subtotal": 820,
    "tax": 41,
    "discount": 0,
    "total": 861,
    "payment_status": "unpaid",
    "payment_method": null,
    "notes": null,
    "placed_at": null,
    "completed_at": null,
    "items": [
      { "id": 5001, "menu_item_id": 45, "item_name": "Margherita Pizza", "quantity": 2, "unit_price": 320, "line_total": 640, "notes": null },
      { "id": 5002, "menu_item_id": 51, "item_name": "Garlic Bread", "quantity": 1, "unit_price": 180, "line_total": 180, "notes": "no onion" }
    ],
    "created_at": "2026-07-25T12:00:00.000Z",
    "updated_at": "2026-07-25T12:00:00.000Z"
  }
}
```

Status transition `PATCH /api/orders/987/status`:

```json
{ "status": "sent_to_kitchen" }
```

Response `200`: order with `status: "sent_to_kitchen"`, `placed_at` set.

Payment `POST /api/orders/987/payment`:

```json
{ "payment_method": "upi", "complete": true }
```

Response `200`: `payment_status: "paid"`, `status: "completed"`, `completed_at` set,
table 12 freed.

List `GET /api/orders?status=preparing&table_id=12&payment_status=unpaid`:

```json
{ "data": [ { "id": 987, "order_number": "ORD-2026-000123", "status": "preparing", "total": 861, "payment_status": "unpaid" } ], "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 } }
```

### 3.12 List query params

- `page`, `limit`, `sort` (whitelist: `created_at`, `order_number`, `total`,
  `status`; default `created_at DESC`).
- `status` — one `order_status` value (kitchen queue uses
  `status=sent_to_kitchen,preparing` — accept CSV or repeated param).
- `payment_status` — one `payment_status` value.
- `order_type` — one `order_type` value.
- `table_id` — filter by table.
- `waiter_id` — filter by waiter.
- `date_from` / `date_to` — filter on `created_at`.
- `search` — `ILIKE` on `order_number`.

### 3.13 Errors

- 404: order id, item id, or referenced menu item not found.
- 409: invalid status transition; terminal-state mutation; complete-without-paid;
  item mutation on non-editable order; add unavailable item; delete table with
  active order; duplicate `order_number` (retried); already paid.
- 422: dine_in without `table_id`; takeaway/delivery with `table_id`; `discount`
  > subtotal or < 0; `quantity < 1`; unknown enum; unknown/forbidden keys.
- 403: chef using a non-kitchen transition or item/header/payment route; cashier on
  item/header routes; waiter on payment.

---

## 4. Recipes module (`recipes` + `recipe_ingredients`)

### 4.1 Purpose and owned columns

A recipe is the ingredient bill-of-materials for a single menu item (one-to-one).
Chefs own recipes fully. Recipe + its ingredient lines are managed atomically.

`recipes` (spec `01` §5.2):

| Column            | Type            | Notes                                                    |
|-------------------|-----------------|----------------------------------------------------------|
| id                | bigint identity | PK                                                       |
| menu_item_id      | bigint          | NOT NULL, UNIQUE, FK → menu_items(id) ON DELETE CASCADE  |
| yield_servings    | int             | NOT NULL DEFAULT 1, CHECK (yield_servings > 0)          |
| instructions      | text            | NULL                                                     |
| prep_time_minutes | int             | NULL                                                     |

`recipe_ingredients` (spec `01` §5.2):

| Column        | Type             | Notes                                                    |
|---------------|------------------|----------------------------------------------------------|
| id            | bigint identity  | PK                                                       |
| recipe_id     | bigint           | NOT NULL, FK → recipes(id) ON DELETE CASCADE             |
| ingredient_id | bigint           | NOT NULL, FK → ingredients(id) ON DELETE RESTRICT        |
| quantity      | numeric(12,3)    | NOT NULL, CHECK (quantity > 0)                          |
| unit          | measurement_unit | NOT NULL                                                 |

Unique `uq_recipes ...`: `recipes.menu_item_id` is UNIQUE (one recipe per item).
Unique `uq_recipe_ingredients_recipe_ingredient` on `(recipe_id, ingredient_id)`.
`measurement_unit` enum: `kg | g | l | ml | unit | pack | dozen | box`.

### 4.2 Endpoints

Matrix row (spec `04`): **Recipes — owner CRUD, manager CRUD, chef CRUD, waiter R,
cashier (none), store_manager (none)**.

| METHOD | Path                                          | Description                          | Allowed roles                  | Success |
|--------|-----------------------------------------------|--------------------------------------|--------------------------------|---------|
| GET    | /api/recipes                                  | List recipes                         | owner, manager, chef, waiter   | 200     |
| GET    | /api/recipes/:id                              | Get recipe with ingredients          | owner, manager, chef, waiter   | 200     |
| GET    | /api/menu-items/:id/recipe                    | Get recipe by menu item              | owner, manager, chef, waiter   | 200     |
| POST   | /api/recipes                                  | Create recipe (+ ingredients)        | owner, manager, chef           | 201     |
| PATCH  | /api/recipes/:id                              | Update recipe header                 | owner, manager, chef           | 200     |
| PUT    | /api/recipes/:id/ingredients                  | Replace full ingredient list         | owner, manager, chef           | 200     |
| POST   | /api/recipes/:id/ingredients                  | Add one ingredient line              | owner, manager, chef           | 201     |
| PATCH  | /api/recipes/:id/ingredients/:ingredientId    | Update one ingredient line           | owner, manager, chef           | 200     |
| DELETE | /api/recipes/:id/ingredients/:ingredientId    | Remove one ingredient line           | owner, manager, chef           | 200     |
| DELETE | /api/recipes/:id                              | Delete recipe (hard; cascades lines) | owner, manager, chef           | 200     |

Note: `:ingredientId` is the `recipe_ingredients.id`, not `ingredients.id`.

### 4.3 List query params

- `page`, `limit`, `sort` (whitelist: `created_at`, `yield_servings`; default
  `created_at DESC`).
- `menu_item_id` — filter (returns the single matching recipe).
- `ingredient_id` — filter to recipes using a given ingredient.
- `search` — `ILIKE` on the joined `menu_items.name`.

### 4.4 Request bodies (Zod)

Recipe `createSchema` (`.strict()`):

```js
{
  menu_item_id:      z.coerce.number().int().positive(),      // required, UNIQUE
  yield_servings:    z.coerce.number().int().min(1).optional(), // CHECK > 0, default 1
  instructions:      z.string().trim().max(5000).optional().nullable(),
  prep_time_minutes: z.coerce.number().int().min(0).optional().nullable(),
  ingredients:       z.array(recipeIngredientInput).optional(), // optional inline lines
}
```

`recipeIngredientInput` (`POST /:id/ingredients` and each `PUT` list element):

```js
{
  ingredient_id: z.coerce.number().int().positive(),            // required, FK
  quantity:      z.coerce.number().positive(),                  // CHECK quantity > 0
  unit:          z.enum(['kg','g','l','ml','unit','pack','dozen','box']), // required
}
```

Recipe header `updateSchema` (`PATCH /:id`, non-empty) = `createSchema` minus
`menu_item_id` and `ingredients`, all optional:

```js
{
  yield_servings:    z.coerce.number().int().min(1).optional(),
  instructions:      z.string().trim().max(5000).optional().nullable(),
  prep_time_minutes: z.coerce.number().int().min(0).optional().nullable(),
}
```

`PUT /:id/ingredients` body (full replace):

```js
{ ingredients: z.array(recipeIngredientInput).min(0) }
```

Line update (`PATCH /:id/ingredients/:ingredientId`):

```js
{
  quantity: z.coerce.number().positive().optional(),
  unit:     z.enum(['kg','g','l','ml','unit','pack','dozen','box']).optional(),
}
```

### 4.5 Examples

Create recipe `POST /api/recipes`:

```json
{ "menu_item_id": 45, "yield_servings": 1, "instructions": "Stretch dough, top, bake 90s.", "ingredients": [ { "ingredient_id": 3, "quantity": 0.25, "unit": "kg" }, { "ingredient_id": 8, "quantity": 0.15, "unit": "kg" } ] }
```

Response `201`:

```json
{
  "data": {
    "id": 30,
    "menu_item_id": 45,
    "yield_servings": 1,
    "instructions": "Stretch dough, top, bake 90s.",
    "prep_time_minutes": null,
    "ingredients": [
      { "id": 101, "ingredient_id": 3, "quantity": 0.25, "unit": "kg" },
      { "id": 102, "ingredient_id": 8, "quantity": 0.15, "unit": "kg" }
    ],
    "created_at": "2026-07-25T13:00:00.000Z",
    "updated_at": "2026-07-25T13:00:00.000Z"
  }
}
```

Get by menu item `GET /api/menu-items/45/recipe`: same `{ data: {...} }` shape.

### 4.6 Business rules and edge cases

- **One recipe per menu item:** `recipes.menu_item_id` is UNIQUE. Creating a second
  recipe for the same item → `23505` → **409** ("Recipe already exists for this menu
  item"). Use `GET /menu-items/:id/recipe` to fetch/edit the existing one.
- `menu_item_id` must reference an existing menu item; FK `ON DELETE CASCADE` means
  deleting the menu item deletes its recipe automatically. Missing item on create →
  FK `23503` → **409/400**.
- **Ingredient lines:** unique on `(recipe_id, ingredient_id)`
  (`uq_recipe_ingredients_recipe_ingredient`) — the same ingredient may not appear
  twice in one recipe → `23505` → **409** ("Ingredient already in recipe"; update the
  existing line instead).
- `quantity > 0` (CHECK) validated by Zod (422); DB `23514` → 422 backstop. Zero or
  negative quantity → 422.
- `ingredient_id` FK `ON DELETE RESTRICT`: an ingredient used by a recipe cannot be
  hard-deleted (that is the ingredients module's concern, spec `07`); referencing a
  non-existent ingredient → `23503` → **409/400**.
- `yield_servings > 0` (CHECK) → 422 if `< 1`.
- DELETE recipe is a **hard delete** (recipes are transactional-config, not in the
  soft-delete list in spec `01` §1.4); `ON DELETE CASCADE` removes
  `recipe_ingredients`. Deleting a single line uses the nested DELETE.
- `PUT /:id/ingredients` replaces the whole list atomically (delete existing rows,
  insert the new set) — used by the recipe editor's save-all.

### 4.7 Transaction requirements

Use `withTransaction` (spec `05` §6) for: create-with-ingredients (recipe row +
lines), and `PUT /:id/ingredients` full replace (delete-then-insert). Both must be
atomic — the recipe and all its lines commit or roll back together, so a partial
ingredient set is never persisted.

### 4.8 Errors

- 404: recipe id, line id (`recipe_ingredients.id`), or `menu_item_id` not found.
- 409: second recipe for a menu item; duplicate ingredient in recipe; FK to missing
  menu item / ingredient.
- 422: `quantity <= 0`, `yield_servings < 1`, unknown `unit` enum, unknown keys,
  empty update body.

---

## 5. Acceptance checklist (module family)

Tables:
- [ ] Full CRUD; `label` unique (409 on dup); `capacity > 0` enforced (422).
- [ ] Waiter may `PATCH` only `status`; manager/owner may edit all fields; others 403.
- [ ] Delete blocked (409) while an active dine_in order references the table.
- [ ] List supports `status`, `section`, `search`, pagination, whitelisted sort.

Menu:
- [ ] Categories and items full CRUD with correct roles; chef limited to
      availability/prep fields on items (no price edits).
- [ ] `DELETE` deactivates (soft) categories and items (`is_active=false`), never
      hard-deletes; deactivating a category with active items → 409.
- [ ] `PATCH /menu-items/:id/availability` toggles `is_available` only.
- [ ] Uniqueness enforced: category `name`, item `(category_id, name)` → 409.
- [ ] `price >= 0`, `prep_time_minutes >= 0` validated (422).

Orders:
- [ ] `order_number` generated as `ORD-YYYY-NNNNNN`, unique, collision-safe.
- [ ] `item_name` and `unit_price` snapshotted into `order_items`; client cannot
      override.
- [ ] `subtotal`/`tax`/`total` recomputed server-side from `order_items` and
      `restaurant_profile.tax_rate`; client totals ignored; `discount <= subtotal`.
- [ ] Lifecycle enforced: open → sent_to_kitchen → preparing → ready → served →
      completed, plus cancelled; invalid/backward/terminal transitions → 409.
- [ ] Role-per-transition enforced: chef only sent_to_kitchen→preparing→ready;
      waiter service-side; owner/manager complete/cancel.
- [ ] Nested items endpoints (`POST/PATCH/DELETE /orders/:id/items`) work and
      recompute totals; blocked once order is non-editable (409).
- [ ] Payment endpoint sets `payment_status`/`payment_method` (cashier field-level);
      completion requires `payment_status='paid'`.
- [ ] Dine_in order occupies its table; completing/cancelling frees it (only when no
      other active order holds it); takeaway/delivery leave `table_id` null.
- [ ] Order + items + totals + table status changes are transactional (atomic).

Recipes:
- [ ] One recipe per menu item (UNIQUE `menu_item_id`) → 409 on duplicate.
- [ ] Nested ingredient management: add/update/delete line + full `PUT` replace.
- [ ] `(recipe_id, ingredient_id)` unique → 409; `quantity > 0`, valid `unit` enum.
- [ ] Recipe delete cascades ingredient lines; create-with-ingredients and full
      replace are transactional.

Cross-cutting:
- [ ] All list endpoints return `{ data, meta }` with pagination/sort/filter.
- [ ] All writes validated with Zod; 422 envelope with field errors on failure.
- [ ] Postgres constraint errors mapped (23505→409, 23503→409/400, 23514→422,
      22P02→400); no SQL/stack leaks.
- [ ] Unauthorized role → 403; missing/invalid token → 401; not found → 404.
