# Phase 1 — Spec 07: Inventory & Supply Modules

> Backend CRUD for the supply-chain side of RestaurantOS: Ingredients, Suppliers,
> Product Categories, Products, Warehouses/Stores, Stock In/Out (movements), and
> Purchase Orders. Depends on **spec `01`** (table/column names are used verbatim),
> **spec `04`** (permission matrix rows are copied verbatim), and **spec `05`**
> (module anatomy, Zod validation, error flow, `{ data, meta }` envelope,
> pagination, and `withTransaction`). Where this spec and the spec `04` matrix
> disagree, the matrix wins.

## 1. Two inventory concepts (do not merge)

Per spec `01` §2 there are **two parallel, separate inventory concepts**. This
spec keeps them distinct on purpose:

- **Ingredients** (`ingredients`) = raw kitchen consumables used by recipes
  (flour, tomato, chicken). Stock lives directly in `ingredients.current_stock`.
  It is reduced by recipe consumption / manual adjustment. Ingredients are
  **not** stored per-warehouse in Phase 1, are **not** moved by `stock_movements`,
  and are **not** replenished by purchase orders. They drive low-stock alerts.
- **Products** (`products`) = general supply-chain inventory purchased from
  suppliers, stored in **warehouses**, moved via **`stock_movements`**, and
  replenished via **purchase orders**. `products.current_stock` is the source of
  truth, kept in sync by movements and PO receiving inside DB transactions.

Consequences enforced throughout this spec:
- `stock_movements`, `purchase_orders`, and `purchase_order_items` reference
  **`product_id`**, never `ingredient_id`.
- Ingredient stock is only ever changed through the Ingredients endpoints
  (create/update or the ingredient stock-adjust endpoint in §2.7), never through
  `stock_movements`.
- Both appear on the dashboard low-stock widget (spec `10`) but through separate
  queries.

## 2. Modules covered

| # | Module | Table(s) owned | Base path |
|---|--------|----------------|-----------|
| 2.1 | Suppliers | `suppliers` | `/api/suppliers` |
| 2.2 | Ingredients | `ingredients` | `/api/ingredients` |
| 2.3 | Product Categories | `product_categories` | `/api/product-categories` |
| 2.4 | Products | `products` | `/api/products` |
| 2.5 | Warehouses / Stores | `warehouses` | `/api/warehouses` |
| 2.6 | Stock Movements (Stock In/Out) | `stock_movements` | `/api/stock-movements` |
| 2.7 | Purchase Orders | `purchase_orders` + `purchase_order_items` | `/api/purchase-orders` |

All routers apply `router.use(authMiddleware)` once (spec `05` §1.1). Every write
route is guarded by `validate(schema)` (spec `05` §3). `requireRole` applies
owner-bypass (spec `04` §2.1), so `owner` is omitted from the `requireRole(...)`
lists below but is always allowed.

### Shared conventions for this spec

- **Money** columns (`cost_per_unit`, `cost_price`, `unit_cost`, `subtotal`,
  `tax`, `total`, `line_total`) are `numeric(12,2)`; **quantity** columns
  (`current_stock`, `reorder_level`, `quantity`, `quantity_ordered`,
  `quantity_received`) are `numeric(12,3)` (spec `01` §1.3). Cast to numbers in
  the service mapper (spec `05` §6).
- **`unit`** is the `measurement_unit` enum: `kg | g | l | ml | unit | pack |
  dozen | box` (spec `01` §3).
- **Pagination/sort/filter** exactly as spec `05` §5: `page` (default 1), `limit`
  (default 20, max 100), `sort` (e.g. `-created_at`, whitelisted per module),
  plus module filters. List `meta` is `{ page, limit, total, totalPages }`.
- **Soft delete**: `suppliers`, `ingredients`, `product_categories`, `products`,
  `warehouses` set `is_active = false` on `DELETE` (spec `01` §1.4). Movements and
  purchase orders are transactional records (POs cancel; movements are immutable).
- **FK validation**: when a body references a `supplier_id`, `category_id`,
  `warehouse_id`, or `product_id` that does not exist (or is inactive where
  required), the service throws `ApiError(409, ...)` before writing, and the DB
  FK is the backstop (`23503` → 409 via error middleware, spec `05` §2.2).

---

## 2.1 Suppliers

**Purpose.** Vendors that supply ingredients, products, purchase orders, invoices,
and expenses. Owns table **`suppliers`**: `id`, `name`, `contact_name`, `email`,
`phone`, `address`, `payment_terms`, `is_active` (+ `created_at`/`updated_at`).
Unique constraint `uq_suppliers_name` on `name`.

### Endpoints

| Method + path | Description | Allowed roles | Success |
|---------------|-------------|---------------|---------|
| GET `/api/suppliers` | List suppliers (paginated, filterable) | owner, manager, store_manager | 200 |
| GET `/api/suppliers/:id` | Get one supplier | owner, manager, store_manager | 200 |
| POST `/api/suppliers` | Create supplier | owner, manager, store_manager | 201 |
| PATCH `/api/suppliers/:id` | Update supplier | owner, manager, store_manager | 200 |
| DELETE `/api/suppliers/:id` | Deactivate supplier (soft delete) | owner, manager, store_manager | 200 |

> Matrix row (spec `04`), **Suppliers**: owner CRUD, manager CRUD, store_manager
> CRUD; chef/waiter/cashier no access (403).

### List query params

- `page`, `limit`, `sort` (whitelist: `name`, `created_at`, `updated_at`; default
  `-created_at`).
- `search` → `ILIKE '%'||$1||'%'` on `name`, `contact_name`, `email`.
- `is_active` (boolean; default: return active only unless `is_active=false` or
  `all` is passed — document choice: default returns **active only**).

### Request bodies (Zod, `.strict()`)

`createSchema`:
```
name:          z.string().trim().min(1).max(200)      // maps suppliers.name (unique)
contact_name:  z.string().trim().max(200).optional().nullable()
email:         z.string().trim().email().max(200).optional().nullable()
phone:         z.string().trim().max(50).optional().nullable()
address:       z.string().trim().max(1000).optional().nullable()
payment_terms: z.string().trim().max(100).optional().nullable()   // e.g. "Net 30"
is_active:     z.boolean().optional()                 // defaults true in DB
```
`updateSchema = createSchema.partial()` (at least one key; `name` still unique).

### Example

Request `POST /api/suppliers`:
```json
{ "name": "Fresh Farms Co", "contact_name": "Asha Rao", "email": "sales@freshfarms.example", "phone": "+91-98000-11111", "payment_terms": "Net 30" }
```
Response `201`:
```json
{
  "data": {
    "id": 12,
    "name": "Fresh Farms Co",
    "contact_name": "Asha Rao",
    "email": "sales@freshfarms.example",
    "phone": "+91-98000-11111",
    "address": null,
    "payment_terms": "Net 30",
    "is_active": true,
    "created_at": "2026-07-25T09:00:00.000Z",
    "updated_at": "2026-07-25T09:00:00.000Z"
  }
}
```

### Business rules / edge cases

- Duplicate `name` → `23505` → **409** "Supplier name already exists".
- `DELETE` sets `is_active = false`; it does **not** hard-delete (preserves
  history on products/POs/invoices). Re-activate via `PATCH { "is_active": true }`.
- Deactivating a supplier still referenced by active products/ingredients/POs is
  **allowed** (FKs are `ON DELETE SET NULL`/`RESTRICT` and we never hard-delete);
  document: deactivation does not cascade and does not null out references.
- `GET/:id` on a missing id → **404** "Supplier not found".

---

## 2.2 Ingredients

**Purpose.** Raw kitchen consumables (recipe components) with their **own**
`current_stock`. Owns table **`ingredients`**: `id`, `name`, `unit`,
`current_stock`, `reorder_level`, `cost_per_unit`, `supplier_id`, `is_active`
(+ timestamps). Unique `uq_ingredients_name` on `name`. Index
`idx_ingredients_supplier_id`. **Low stock = `current_stock <= reorder_level`.**

### Endpoints

| Method + path | Description | Allowed roles | Success |
|---------------|-------------|---------------|---------|
| GET `/api/ingredients` | List ingredients | owner, manager, chef, store_manager | 200 |
| GET `/api/ingredients/:id` | Get one ingredient | owner, manager, chef, store_manager | 200 |
| POST `/api/ingredients` | Create ingredient | owner, manager, store_manager | 201 |
| PATCH `/api/ingredients/:id` | Update ingredient | owner, manager, chef, store_manager | 200 |
| POST `/api/ingredients/:id/adjust-stock` | Adjust `current_stock` (delta + reason) | owner, manager, chef, store_manager | 200 |
| DELETE `/api/ingredients/:id` | Deactivate ingredient (soft delete) | owner, manager, store_manager | 200 |

> Matrix row (spec `04`), **Ingredients**: owner CRUD, manager CRUD, **chef RU**,
> store_manager CRUD; waiter/cashier no access (403).
> Note the chef granularity: chef may **read and update** ingredients (including
> the stock adjust, which is an update of `current_stock`) but may **not** create
> or delete. `POST /:id/adjust-stock` is modeled as an update, so chef is allowed;
> `POST /` (create) is not.

### List query params

- `page`, `limit`, `sort` (whitelist: `name`, `current_stock`, `reorder_level`,
  `cost_per_unit`, `created_at`, `updated_at`; default `name`).
- `search` → `ILIKE` on `name`.
- `supplier_id` (bigint) — filter by supplier.
- `low_stock` (boolean) — when `true`, only rows where
  `current_stock <= reorder_level`.
- `is_active` (default active only).

### Request bodies (Zod, `.strict()`)

`createSchema`:
```
name:          z.string().trim().min(1).max(200)             // ingredients.name (unique)
unit:          z.enum(['kg','g','l','ml','unit','pack','dozen','box'])
current_stock: z.coerce.number().min(0).optional()           // numeric(12,3); default 0
reorder_level: z.coerce.number().min(0).optional()           // numeric(12,3); default 0
cost_per_unit: z.coerce.number().min(0).optional()           // numeric(12,2); default 0
supplier_id:   z.coerce.number().int().positive().optional().nullable()  // FK suppliers(id)
is_active:     z.boolean().optional()
```
`updateSchema = createSchema.partial()`.

`adjustStockSchema` (for `POST /:id/adjust-stock`):
```
delta:  z.coerce.number()                     // signed; +receive / -consume; !== 0
reason: z.string().trim().min(1).max(500)     // required (why the stock changed)
```

### Example

Request `POST /api/ingredients`:
```json
{ "name": "All-purpose Flour", "unit": "kg", "current_stock": 50, "reorder_level": 10, "cost_per_unit": 42.5, "supplier_id": 12 }
```
Response `201`:
```json
{
  "data": {
    "id": 8,
    "name": "All-purpose Flour",
    "unit": "kg",
    "current_stock": 50,
    "reorder_level": 10,
    "cost_per_unit": 42.5,
    "supplier_id": 12,
    "is_active": true,
    "created_at": "2026-07-25T09:05:00.000Z",
    "updated_at": "2026-07-25T09:05:00.000Z"
  }
}
```

List `meta` example: `{ "page": 1, "limit": 20, "total": 34, "totalPages": 2 }`.

### Business rules / edge cases

- Duplicate `name` → **409** "Ingredient name already exists".
- `supplier_id` provided but not found → **409** "Referenced supplier not found".
- `current_stock` has `CHECK (current_stock >= 0)`. Any update or
  `adjust-stock` that would drive it below 0 → **422** "Stock cannot go negative"
  (validate the resulting value in the service; the `CHECK` / `23514` is the
  backstop → 422 per spec `05` §2.2).
- `adjust-stock` reads the current row, computes `current_stock + delta`, rejects
  a negative result (422), then persists the new value in **one** statement
  (`UPDATE ... SET current_stock = current_stock + $delta WHERE id = $id AND
  current_stock + $delta >= 0 RETURNING *`); if no row returned and the id exists,
  the delta was too negative → 422. This is a single-table update; no
  `stock_movements` row is created (ingredients are not part of the movement
  ledger, §1).
- `DELETE` → soft delete (`is_active = false`). `ingredients` is referenced by
  `recipe_ingredients` with `ON DELETE RESTRICT`, so hard delete is deliberately
  not offered here.
- Missing id → **404** "Ingredient not found".

---

## 2.3 Product Categories

**Purpose.** Categorizes inventory **products** (distinct from `menu_categories`).
Owns table **`product_categories`**: `id`, `name`, `description`, `is_active`
(+ timestamps). Unique `uq_product_categories_name` on `name`.

### Endpoints

| Method + path | Description | Allowed roles | Success |
|---------------|-------------|---------------|---------|
| GET `/api/product-categories` | List categories | owner, manager, store_manager | 200 |
| GET `/api/product-categories/:id` | Get one category | owner, manager, store_manager | 200 |
| POST `/api/product-categories` | Create category | owner, manager, store_manager | 201 |
| PATCH `/api/product-categories/:id` | Update category | owner, manager, store_manager | 200 |
| DELETE `/api/product-categories/:id` | Deactivate category (soft delete) | owner, manager, store_manager | 200 |

> Matrix row (spec `04`), **Product categories**: owner CRUD, manager CRUD,
> store_manager CRUD; others no access (403).

### List query params

- `page`, `limit`, `sort` (whitelist: `name`, `created_at`, `updated_at`; default
  `name`).
- `search` → `ILIKE` on `name`, `description`.
- `is_active` (default active only).

### Request bodies (Zod, `.strict()`)

`createSchema`:
```
name:        z.string().trim().min(1).max(200)                 // product_categories.name (unique)
description: z.string().trim().max(1000).optional().nullable()
is_active:   z.boolean().optional()
```
`updateSchema = createSchema.partial()`.

### Example

Response `201` to `POST /api/product-categories { "name": "Cleaning Supplies" }`:
```json
{ "data": { "id": 5, "name": "Cleaning Supplies", "description": null, "is_active": true, "created_at": "2026-07-25T09:10:00.000Z", "updated_at": "2026-07-25T09:10:00.000Z" } }
```

### Business rules / edge cases

- Duplicate `name` → **409** "Product category name already exists".
- `DELETE` → soft delete. `products.category_id` FK is `ON DELETE SET NULL`, so
  deactivating a referenced category is allowed and does not null out product
  links (deactivation != delete). Products keep pointing at the inactive category.
- Missing id → **404** "Product category not found".

---

## 2.4 Products

**Purpose.** Supply-chain inventory items stored in warehouses, moved by
`stock_movements`, replenished by purchase orders. Owns table **`products`**:
`id`, `sku`, `name`, `category_id`, `unit`, `current_stock`, `reorder_level`,
`cost_price`, `supplier_id`, `warehouse_id`, `is_active` (+ timestamps). Unique
`uq_products_sku` on `sku`. Indexes `idx_products_category_id`,
`idx_products_supplier_id`, `idx_products_warehouse_id`.
**Low stock = `current_stock <= reorder_level`.** `current_stock` is the source of
truth, mutated only by stock movements and PO receiving (§2.6, §2.7), never edited
directly through `PATCH`.

### Endpoints

| Method + path | Description | Allowed roles | Success |
|---------------|-------------|---------------|---------|
| GET `/api/products` | List products | owner, manager, store_manager | 200 |
| GET `/api/products/:id` | Get one product | owner, manager, store_manager | 200 |
| POST `/api/products` | Create product | owner, manager, store_manager | 201 |
| PATCH `/api/products/:id` | Update product (not `current_stock`) | owner, manager, store_manager | 200 |
| DELETE `/api/products/:id` | Deactivate product (soft delete) | owner, manager, store_manager | 200 |

> Matrix row (spec `04`), **Products**: owner CRUD, manager CRUD, store_manager
> CRUD; others no access (403).

### List query params

- `page`, `limit`, `sort` (whitelist: `name`, `sku`, `current_stock`,
  `reorder_level`, `cost_price`, `created_at`, `updated_at`; default
  `-created_at`).
- `search` → `ILIKE` on `sku`, `name`.
- `category_id` (bigint) — filter by product category.
- `supplier_id` (bigint) — filter by supplier.
- `warehouse_id` (bigint) — filter by home warehouse.
- `low_stock` (boolean) — only rows where `current_stock <= reorder_level`.
- `is_active` (default active only).

### Request bodies (Zod, `.strict()`)

`createSchema`:
```
sku:           z.string().trim().min(1).max(100)     // products.sku (unique)
name:          z.string().trim().min(1).max(200)
category_id:   z.coerce.number().int().positive().optional().nullable()   // FK product_categories(id)
unit:          z.enum(['kg','g','l','ml','unit','pack','dozen','box'])
current_stock: z.coerce.number().min(0).optional()   // opening balance only; default 0
reorder_level: z.coerce.number().min(0).optional()   // default 0
cost_price:    z.coerce.number().min(0).optional()   // numeric(12,2); default 0
supplier_id:   z.coerce.number().int().positive().optional().nullable()   // FK suppliers(id)
warehouse_id:  z.coerce.number().int().positive().optional().nullable()   // FK warehouses(id) home warehouse
is_active:     z.boolean().optional()
```
`updateSchema`: `createSchema.partial()` **minus `current_stock`** (updates must
not set stock directly; use stock movements). If `current_stock` is present in an
update body, reject with **422** "current_stock is managed by stock movements".
`current_stock` may only be set on **create** as an opening balance.

### Example

Request `POST /api/products`:
```json
{ "sku": "CLN-BLEACH-5L", "name": "Bleach 5L", "category_id": 5, "unit": "box", "reorder_level": 4, "cost_price": 320, "supplier_id": 12, "warehouse_id": 2 }
```
Response `201`:
```json
{
  "data": {
    "id": 41,
    "sku": "CLN-BLEACH-5L",
    "name": "Bleach 5L",
    "category_id": 5,
    "unit": "box",
    "current_stock": 0,
    "reorder_level": 4,
    "cost_price": 320,
    "supplier_id": 12,
    "warehouse_id": 2,
    "is_active": true,
    "created_at": "2026-07-25T09:15:00.000Z",
    "updated_at": "2026-07-25T09:15:00.000Z"
  }
}
```

### Business rules / edge cases

- Duplicate `sku` → **409** "SKU already exists".
- `category_id` / `supplier_id` / `warehouse_id` provided but not found →
  **409** "Referenced <category|supplier|warehouse> not found". Validate each in
  the service before insert; DB `23503` is the backstop.
- `current_stock` `CHECK (current_stock >= 0)`; opening balance cannot be negative
  → 422.
- `PATCH` never mutates `current_stock` (see `updateSchema`).
- `DELETE` → soft delete. `stock_movements` and `purchase_order_items` reference
  products with `ON DELETE RESTRICT`, so hard delete is not offered; deactivation
  preserves the ledger. A deactivated product should not be selectable for **new**
  POs/movements (validate `is_active` where the product is chosen, §2.6/§2.7).
- Missing id → **404** "Product not found".

---

## 2.5 Warehouses / Stores

**Purpose.** Storage locations for products (Warehouse / Store Management). Owns
table **`warehouses`**: `id`, `name`, `location`, `type` (default `'store'`, e.g.
`'store'`/`'kitchen'`), `is_active` (+ timestamps). Unique `uq_warehouses_name` on
`name`.

### Endpoints

| Method + path | Description | Allowed roles | Success |
|---------------|-------------|---------------|---------|
| GET `/api/warehouses` | List warehouses | owner, manager, store_manager | 200 |
| GET `/api/warehouses/:id` | Get one warehouse | owner, manager, store_manager | 200 |
| POST `/api/warehouses` | Create warehouse | owner, manager, store_manager | 201 |
| PATCH `/api/warehouses/:id` | Update warehouse | owner, manager, store_manager | 200 |
| DELETE `/api/warehouses/:id` | Deactivate warehouse (soft delete) | owner, manager, store_manager | 200 |

> Matrix row (spec `04`), **Warehouses / stores**: owner CRUD, manager CRUD,
> store_manager CRUD; others no access (403).

### List query params

- `page`, `limit`, `sort` (whitelist: `name`, `type`, `created_at`, `updated_at`;
  default `name`).
- `search` → `ILIKE` on `name`, `location`.
- `type` (string) — filter by warehouse type.
- `is_active` (default active only).

### Request bodies (Zod, `.strict()`)

`createSchema`:
```
name:      z.string().trim().min(1).max(200)                 // warehouses.name (unique)
location:  z.string().trim().max(500).optional().nullable()
type:      z.string().trim().max(50).optional()              // default 'store'
is_active: z.boolean().optional()
```
`updateSchema = createSchema.partial()`.

### Example

Response `201`:
```json
{ "data": { "id": 2, "name": "Main Store", "location": "Basement", "type": "store", "is_active": true, "created_at": "2026-07-25T09:20:00.000Z", "updated_at": "2026-07-25T09:20:00.000Z" } }
```

### Business rules / edge cases

- Duplicate `name` → **409** "Warehouse name already exists".
- `DELETE` → soft delete. `products.warehouse_id` is `ON DELETE SET NULL`;
  `stock_movements.warehouse_id` and `purchase_orders.warehouse_id` are
  `ON DELETE RESTRICT`. Deactivation is allowed and does not cascade; a
  deactivated warehouse must not be selectable for new movements/POs (validate
  `is_active`, §2.6/§2.7).
- Missing id → **404** "Warehouse not found".

---

## 2.6 Stock Movements (Stock In / Stock Out)

**Purpose.** The append-only ledger of product stock changes. Owns table
**`stock_movements`**: `id`, `product_id`, `warehouse_id`, `movement_type`,
`quantity`, `unit_cost`, `reference`, `reason`, `created_by` (+ timestamps).
Indexes `idx_stock_movements_product_id`, `idx_stock_movements_created_at`. Each
movement **atomically** updates `products.current_stock`.

Movements are **immutable**: there is no update or delete. To correct a mistake,
post a compensating `adjustment`/`wastage`/`stock_in` movement. Only `products`
participate here (ingredients are excluded, §1).

### Endpoints

| Method + path | Description | Allowed roles | Success |
|---------------|-------------|---------------|---------|
| GET `/api/stock-movements` | List movements (ledger) | owner, manager, store_manager | 200 |
| GET `/api/stock-movements/:id` | Get one movement | owner, manager, store_manager | 200 |
| POST `/api/stock-movements` | Record a movement (updates product stock, atomic) | owner, manager, store_manager | 201 |

> Matrix row (spec `04`), **Stock in / out / movements**: owner CRUD, manager
> CRUD, store_manager CRUD; others no access (403). No `PATCH`/`DELETE` are
> exposed (movements are immutable); the "U"/"D" of the matrix is satisfied by
> compensating movements.

### List query params

- `page`, `limit`, `sort` (whitelist: `created_at`, `quantity`; default
  `-created_at`).
- `product_id` (bigint) — filter by product.
- `warehouse_id` (bigint) — filter by warehouse.
- `movement_type` (enum) — `stock_in | stock_out | adjustment | wastage |
  transfer`.
- `search` → `ILIKE` on `reference`, `reason`.

### Sign convention (authoritative)

`quantity` is **always positive** (`CHECK (quantity > 0)`). The **direction** is
derived from `movement_type`:

| movement_type | effect on products.current_stock |
|---------------|----------------------------------|
| `stock_in`    | **add** (+quantity) |
| `transfer`    | **add** (+quantity) — treated as transfer-in in Phase 1 |
| `stock_out`   | **subtract** (-quantity) |
| `wastage`     | **subtract** (-quantity) |
| `adjustment`  | uses `reason`: sign taken from a required `direction` field (see below) |

For `adjustment` the client must supply `direction` (`increase` | `decrease`)
because the enum alone does not imply a sign; `reason` is required to explain it.

### Request body (Zod, `.strict()`)

`createSchema`:
```
product_id:    z.coerce.number().int().positive()            // FK products(id), must be active
warehouse_id:  z.coerce.number().int().positive()            // FK warehouses(id), must be active
movement_type: z.enum(['stock_in','stock_out','adjustment','wastage','transfer'])
quantity:      z.coerce.number().positive()                  // numeric(12,3), > 0
unit_cost:     z.coerce.number().min(0).optional().nullable()  // valuation at movement time
reference:     z.string().trim().max(200).optional().nullable()  // e.g. PO number
reason:        z.string().trim().max(500).optional().nullable()
direction:     z.enum(['increase','decrease']).optional()    // REQUIRED when movement_type = 'adjustment'
```
Cross-field rule: if `movement_type === 'adjustment'`, `direction` is required and
`reason` is required (`.superRefine`). `created_by` is taken from `req.user.id`,
never from the body.

### Transaction requirement (spec `05` §6, `withTransaction`)

Recording a movement runs inside `withTransaction(async (client) => { ... })`:

1. `SELECT ... FOR UPDATE` the target product row (lock it against concurrent
   movements). If missing or `is_active = false` → **409** "Product not found or
   inactive".
2. Validate the warehouse exists and is active → else **409**.
3. Compute `delta` from `movement_type` (+/- per the table; `adjustment` uses
   `direction`).
4. Compute `next_stock = current_stock + delta`. If `next_stock < 0` → throw
   **422** "Insufficient stock: movement would drive stock below zero"
   (for `stock_out`/`wastage`/decrease-adjustment this is the "cannot exceed
   current_stock" rule).
5. `INSERT` the `stock_movements` row (`created_by = req.user.id`).
6. `UPDATE products SET current_stock = current_stock + $delta WHERE id = $product_id`
   (the `CHECK (current_stock >= 0)` / `23514` is the backstop → 422).
7. `COMMIT`. Both the ledger row and the new product balance land together, or
   neither does.

### Example

Request `POST /api/stock-movements`:
```json
{ "product_id": 41, "warehouse_id": 2, "movement_type": "stock_out", "quantity": 3, "reason": "Issued to kitchen" }
```
Response `201`:
```json
{
  "data": {
    "id": 907,
    "product_id": 41,
    "warehouse_id": 2,
    "movement_type": "stock_out",
    "quantity": 3,
    "unit_cost": null,
    "reference": null,
    "reason": "Issued to kitchen",
    "created_by": 7,
    "created_at": "2026-07-25T09:25:00.000Z",
    "updated_at": "2026-07-25T09:25:00.000Z",
    "product_current_stock": 9
  }
}
```
`product_current_stock` is the product's balance **after** the movement (returned
for UI convenience; it is not a column on `stock_movements`).

### Business rules / edge cases

- `quantity <= 0` → **422** (schema + `CHECK`).
- `stock_out`/`wastage`/decrease-`adjustment` exceeding `current_stock` → **422**
  (never let stock go negative). This is the headline stock-safety rule.
- `product_id`/`warehouse_id` not found or inactive → **409**.
- `adjustment` without `direction` or without `reason` → **422**.
- Concurrent movements on the same product are serialized by the `FOR UPDATE`
  lock so two simultaneous stock-outs cannot both pass the balance check.
- Missing id on `GET/:id` → **404** "Stock movement not found".

---

## 2.7 Purchase Orders

**Purpose.** Replenishment orders to suppliers, with nested line items, a status
lifecycle, and a **receive** flow that posts `stock_in` movements. Owns
**`purchase_orders`** (`id`, `po_number`, `supplier_id`, `warehouse_id`, `status`,
`order_date`, `expected_date`, `received_date`, `subtotal`, `tax`, `total`,
`notes`, `created_by`) and **`purchase_order_items`** (`id`, `purchase_order_id`,
`product_id`, `quantity_ordered`, `quantity_received`, `unit_cost`, `line_total`).
Unique `uq_purchase_orders_po_number`. Indexes `idx_purchase_orders_supplier_id`,
`idx_purchase_orders_status`, `idx_purchase_order_items_po_id`.

### Status lifecycle

```
draft ──► ordered ──► partially_received ──► received
  │           │                 │
  └───────────┴─────────────────┴──► cancelled   (allowed from draft/ordered/partially_received)
```
- New POs are created in **`draft`**.
- `draft → ordered`: place the order (only allowed with >= 1 line item).
- `ordered → partially_received → received`: driven by the **receive** endpoint
  based on `quantity_received` vs `quantity_ordered` across all items.
- Any non-terminal status → **`cancelled`** via `DELETE` (cancel).
- Terminal states: `received`, `cancelled` (no further transitions).

### `po_number` format

`PO-YYYY-NNNNNN` (e.g. `PO-2026-000045`): literal `PO`, 4-digit year, dash,
6-digit zero-padded sequence. Generated server-side on create inside the same
transaction (max existing sequence for the current year + 1); never accepted from
the client. Unique via `uq_purchase_orders_po_number`.

### Endpoints

| Method + path | Description | Allowed roles | Success |
|---------------|-------------|---------------|---------|
| GET `/api/purchase-orders` | List POs | owner, manager, store_manager | 200 |
| GET `/api/purchase-orders/:id` | Get one PO with its items | owner, manager, store_manager | 200 |
| POST `/api/purchase-orders` | Create PO (draft) with nested items | owner, manager, store_manager | 201 |
| PATCH `/api/purchase-orders/:id` | Update PO header / status transition | owner, manager, store_manager | 200 |
| POST `/api/purchase-orders/:id/items` | Add a line item (draft only) | owner, manager, store_manager | 201 |
| PATCH `/api/purchase-orders/:id/items/:itemId` | Update a line item (draft only) | owner, manager, store_manager | 200 |
| DELETE `/api/purchase-orders/:id/items/:itemId` | Remove a line item (draft only) | owner, manager, store_manager | 200 |
| POST `/api/purchase-orders/:id/receive` | Receive quantities: post stock_in, advance status (atomic) | owner, manager, store_manager | 200 |
| DELETE `/api/purchase-orders/:id` | Hard-delete if draft, else cancel | owner, manager, store_manager | 200 |

> Matrix row (spec `04`), **Purchase orders**: owner CRUD, manager CRUD,
> store_manager CRUD; others no access (403).

### List query params

- `page`, `limit`, `sort` (whitelist: `po_number`, `order_date`, `expected_date`,
  `total`, `created_at`, `updated_at`; default `-created_at`).
- `search` → `ILIKE` on `po_number`, `notes`.
- `supplier_id` (bigint).
- `warehouse_id` (bigint).
- `status` (enum) — `draft | ordered | partially_received | received | cancelled`.

### Request bodies (Zod, `.strict()`)

`itemInputSchema` (a line item within create / add-item):
```
product_id:       z.coerce.number().int().positive()   // FK products(id), must be active
quantity_ordered: z.coerce.number().positive()         // numeric(12,3), > 0
unit_cost:        z.coerce.number().min(0)             // numeric(12,2)
```
`line_total` and `quantity_received` are **computed**, never accepted from the
client (`line_total = quantity_ordered * unit_cost`; `quantity_received` starts 0).

`createSchema`:
```
supplier_id:   z.coerce.number().int().positive()             // FK suppliers(id), required
warehouse_id:  z.coerce.number().int().positive()             // FK warehouses(id), required
order_date:    z.coerce.date().optional().nullable()
expected_date: z.coerce.date().optional().nullable()
notes:         z.string().trim().max(1000).optional().nullable()
items:         z.array(itemInputSchema).min(1)                // >= 1 line to create
```
`po_number`, `status`, `received_date`, `subtotal`, `tax`, `total`, `created_by`
are all set by the service, not the client. Status starts `draft`.

`updateSchema` (header + status transition):
```
supplier_id:   z.coerce.number().int().positive().optional()   // draft only
warehouse_id:  z.coerce.number().int().positive().optional()   // draft only
order_date:    z.coerce.date().optional().nullable()
expected_date: z.coerce.date().optional().nullable()
notes:         z.string().trim().max(1000).optional().nullable()
status:        z.enum(['draft','ordered','partially_received','received','cancelled']).optional()
```
`status` here only permits legal transitions (see below); `partially_received` and
`received` are normally reached via the receive endpoint, not a manual `PATCH`
(the service rejects illegal transitions with 422).

`addItemSchema = itemInputSchema`. `updateItemSchema = itemInputSchema.partial()`.

`receiveSchema` (for `POST /:id/receive`):
```
lines: z.array(z.object({
  item_id:  z.coerce.number().int().positive(),   // purchase_order_items.id
  quantity: z.coerce.number().positive(),         // amount received now (numeric(12,3))
})).min(1)
received_date: z.coerce.date().optional()          // defaults to today
```

### Totals recomputation

`subtotal`, `tax`, `total` on `purchase_orders` are **always recomputed** by the
service from the line items whenever items change (create, add/update/remove item,
receive). Never trust client totals.
- `subtotal = sum(line_total)` = `sum(quantity_ordered * unit_cost)`.
- `tax` = `subtotal * (restaurant_profile.tax_rate / 100)` (spec `01`
  `restaurant_profile.tax_rate`, percent). Rounded to `numeric(12,2)`.
- `total = subtotal + tax`.

### Create example

Request `POST /api/purchase-orders`:
```json
{
  "supplier_id": 12,
  "warehouse_id": 2,
  "expected_date": "2026-08-01",
  "items": [
    { "product_id": 41, "quantity_ordered": 20, "unit_cost": 320 },
    { "product_id": 42, "quantity_ordered": 10, "unit_cost": 150 }
  ]
}
```
Response `201` (with `tax_rate = 5.00`, `subtotal = 20*320 + 10*150 = 7900`):
```json
{
  "data": {
    "id": 88,
    "po_number": "PO-2026-000045",
    "supplier_id": 12,
    "warehouse_id": 2,
    "status": "draft",
    "order_date": null,
    "expected_date": "2026-08-01",
    "received_date": null,
    "subtotal": 7900,
    "tax": 395,
    "total": 8295,
    "notes": null,
    "created_by": 7,
    "created_at": "2026-07-25T09:30:00.000Z",
    "updated_at": "2026-07-25T09:30:00.000Z",
    "items": [
      { "id": 201, "purchase_order_id": 88, "product_id": 41, "quantity_ordered": 20, "quantity_received": 0, "unit_cost": 320, "line_total": 6400 },
      { "id": 202, "purchase_order_id": 88, "product_id": 42, "quantity_ordered": 10, "quantity_received": 0, "unit_cost": 150, "line_total": 1500 }
    ]
  }
}
```

### Create transaction (spec `05` §6)

`POST /` runs in `withTransaction`:
1. Validate `supplier_id` and `warehouse_id` exist and are active → else **409**.
2. Validate every `items[].product_id` exists and is active → else **409**
   "Referenced product not found".
3. Generate `po_number` for the current year (sequence + 1).
4. `INSERT` the `purchase_orders` header (`status='draft'`, totals placeholder,
   `created_by = req.user.id`).
5. `INSERT` each `purchase_order_items` row with computed `line_total` and
   `quantity_received = 0`.
6. Recompute and `UPDATE` header `subtotal`/`tax`/`total`.
7. `COMMIT`; return header + items.

### Nested line-item endpoints (draft only)

`POST /:id/items`, `PATCH /:id/items/:itemId`, `DELETE /:id/items/:itemId`:
- Allowed **only** when the PO `status = 'draft'`. Otherwise → **409** "Line items
  can only be changed while the purchase order is a draft".
- Each validates product active (add/update) and recomputes header totals in the
  same transaction after the change.
- Removing the last remaining item is allowed but the PO cannot then be moved to
  `ordered` (see transition rules). `DELETE` item returns `{ data: { success:
  true } }`.
- `itemId` not belonging to `:id` → **404** "Line item not found".

### Receive flow (`POST /:id/receive`) — atomic

Only POs in `ordered` or `partially_received` may be received (not `draft`,
`received`, or `cancelled` → **409**). Runs entirely in `withTransaction`:

1. Lock the PO row (`SELECT ... FOR UPDATE`). Load its items.
2. For each `lines[]` entry:
   - Resolve `item_id` to a line on this PO → else **404** "Line item not found".
   - Reject if `quantity_received + quantity > quantity_ordered` → **422**
     "Received quantity exceeds ordered quantity".
   - `UPDATE purchase_order_items SET quantity_received = quantity_received +
     $quantity WHERE id = $item_id`.
   - `INSERT` a `stock_movements` row: `movement_type = 'stock_in'`,
     `quantity = $quantity`, `product_id = item.product_id`,
     `warehouse_id = po.warehouse_id`, `unit_cost = item.unit_cost`,
     `reference = po.po_number`, `created_by = req.user.id`.
   - `UPDATE products SET current_stock = current_stock + $quantity WHERE id =
     item.product_id` (same product-stock rule as §2.6; `CHECK` backstop).
3. Recompute PO status from the (now updated) items:
   - all `quantity_received >= quantity_ordered` for every item → **`received`**,
     set `received_date`.
   - some received (any item `> 0`) but not all complete → **`partially_received`**.
4. `COMMIT`. Line updates, stock movements, product balances, and PO status all
   commit together or roll back together.

Receive example — request `POST /api/purchase-orders/88/receive`:
```json
{ "lines": [ { "item_id": 201, "quantity": 20 }, { "item_id": 202, "quantity": 4 } ] }
```
Result: item 201 fully received (20/20), item 202 partial (4/10), two `stock_in`
movements posted, products 41/42 `current_stock` incremented, PO status →
`partially_received`. Response `200` returns the updated PO with items.

### Delete / cancel

`DELETE /:id`:
- If `status = 'draft'` → **hard delete** (removes header; `purchase_order_items`
  cascade via `ON DELETE CASCADE`). Returns `{ data: { success: true } }`.
- Otherwise → **cancel** (`status = 'cancelled'`). Cannot cancel a `received`
  (terminal) PO → **409** "Received purchase orders cannot be cancelled".
  Cancelling does **not** reverse already-posted stock movements (post a
  compensating movement if needed).

### Status transition rules (enforced in service)

| From | Allowed to | Via |
|------|-----------|-----|
| draft | ordered | PATCH status (needs >= 1 item) |
| draft | cancelled | DELETE |
| ordered | partially_received, received | receive endpoint |
| ordered | cancelled | DELETE |
| partially_received | received | receive endpoint |
| partially_received | cancelled | DELETE |
| received | (none) | terminal |
| cancelled | (none) | terminal |

Any other transition → **422** "Invalid purchase order status transition".
`draft → ordered` with zero items → **422** "Cannot place an empty purchase order".

### Business rules / edge cases (summary)

- `supplier_id`/`warehouse_id`/`product_id` missing or inactive → **409**.
- Line-item edits outside `draft` → **409**.
- Over-receiving a line → **422**.
- Receiving a `draft`/`received`/`cancelled` PO → **409**.
- Empty PO to `ordered` → **422**.
- Duplicate `po_number` (should not happen; sequence is server-side) → **409**.
- Missing PO id → **404** "Purchase order not found".
- Totals never accepted from client; always recomputed.

---

## 3. Cross-module error case reference

| Case | Status | Example message |
|------|--------|-----------------|
| Validation failure (Zod) | 422 | "Validation failed" (+ `errors[]`) |
| Missing/invalid token | 401 | "Authentication required" |
| Wrong role | 403 | "You do not have permission to perform this action" |
| Resource id not found | 404 | "<Resource> not found" |
| Duplicate unique (name/sku/po_number) | 409 | "… already exists" |
| Referenced FK missing/inactive | 409 | "Referenced <x> not found" |
| Stock would go negative | 422 | "Insufficient stock: movement would drive stock below zero" |
| Over-receive a PO line | 422 | "Received quantity exceeds ordered quantity" |
| Item edit on non-draft PO | 409 | "Line items can only be changed while the purchase order is a draft" |
| Illegal PO status transition | 422 | "Invalid purchase order status transition" |

Postgres code mapping (spec `05` §2.2) is the backstop: `23505 → 409`,
`23503 → 409`, `23514 → 422`, `22P02 → 400`.

## 4. Transaction requirements (summary)

| Operation | Must be transactional | Statements |
|-----------|-----------------------|-----------|
| Ingredient adjust-stock | single-statement (guarded UPDATE) | 1 UPDATE (no ledger) |
| Record stock movement | **yes** (`withTransaction`) | lock product, insert movement, update product stock |
| Create PO with items | **yes** | insert header, insert items, recompute totals |
| Add/update/remove PO item (draft) | **yes** | mutate item, recompute totals |
| Receive PO | **yes** | update items, insert stock_in movements, update product stock, advance status |
| Cancel/hard-delete PO | single-statement | UPDATE status or DELETE (cascade items) |

## 5. Acceptance checklist for this spec

- [ ] Ingredients and Products are implemented as **separate** modules; movements
      and POs reference `product_id` only, never ingredients.
- [ ] Every endpoint enforces the exact roles from the spec `04` matrix
      (store_manager has CRUD on all; chef has RU on ingredients only;
      waiter/cashier get 403 on these modules).
- [ ] All writes validated with Zod (`.strict()`); 422 envelope on failure.
- [ ] List endpoints paginate + sort (whitelisted) + filter (`search`,
      `category_id`, `supplier_id`, `warehouse_id`, `low_stock`, `status`) and
      return `meta`.
- [ ] Soft delete (`is_active = false`) for suppliers, ingredients, product
      categories, products, warehouses via `DELETE`.
- [ ] Low stock computed as `current_stock <= reorder_level` for ingredients and
      products; `sku` unique for products; `name` unique for the reference tables.
- [ ] Stock movement sign convention correct (positive quantity; direction from
      `movement_type`; `adjustment` uses `direction`); every movement updates
      `products.current_stock` in the **same transaction**; stock never goes
      negative (409/422 friendly error); `stock_out`/`wastage` cannot exceed
      `current_stock`.
- [ ] PO lifecycle enforced (`draft → ordered → partially_received → received`,
      plus `cancelled`); `po_number` = `PO-YYYY-NNNNNN` generated server-side;
      nested items editable only in `draft`; totals recomputed from line items.
- [ ] `POST /:id/receive` increments `quantity_received`, posts `stock_in`
      movements, updates `products.current_stock`, and advances status to
      `partially_received`/`received`, all atomically.
- [ ] Only `draft` POs hard-delete; others cancel; `received` cannot be cancelled.
- [ ] FK validation returns 409 when supplier/category/warehouse/product missing
      or inactive; central error middleware maps Postgres codes as the backstop.
- [ ] No raw client input concatenated into SQL; totals/`po_number`/`created_by`
      never taken from the client.
