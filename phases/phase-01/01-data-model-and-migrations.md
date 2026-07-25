# Phase 1 — Spec 01: Data Model & Migrations

> The canonical database schema for RestaurantOS. Every backend module spec
> references the table and column names defined here **verbatim**. If a module
> needs a column not listed here, it must be added to this spec first.

## 1. Decisions (read before the schema)

### 1.1 Primary keys
- Use `bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` for every table.
- Rationale: readable in seeds and demos, simple FK wiring, no extension needed.
  UUIDs were considered but rejected for Phase 1 (harder to seed/reference, no
  enumeration-risk requirement for an assessment app). Business-facing identifiers
  that must be human-friendly (order number, PO number, invoice number) are
  **separate** columns (`*_number`), not the PK.

### 1.2 Timestamps
- Every table has `created_at timestamptz NOT NULL DEFAULT now()` and
  `updated_at timestamptz NOT NULL DEFAULT now()`.
- `updated_at` is maintained by a shared trigger `set_updated_at()` (defined in
  the first migration) attached to every table.

### 1.3 Money & quantities
- Money: `numeric(12,2)`.
- Quantities/stock: `numeric(12,3)` (supports fractional units like 1.5 kg).
- Never use float/double for money or stock.

### 1.4 Soft delete vs hard delete
- Reference/config entities that other rows point to use an `is_active boolean`
  flag and are **deactivated**, not hard-deleted, to preserve history:
  `menu_items`, `menu_categories`, `product_categories`, `products`, `suppliers`,
  `warehouses`, `expense_categories`, `ingredients`, `users`.
- Transactional records (`orders`, `purchase_orders`, `expense_records`,
  `supplier_invoices`) may be **cancelled** (status) rather than deleted; hard
  delete is allowed only in `draft`/`open` state and only for Owner/Manager.
- The API `DELETE` verb maps to deactivate/cancel where soft delete applies; this
  is documented per module. Hard delete is the exception, not the default.

### 1.5 Migration runner
- **Chosen:** hand-rolled numbered SQL runner (no ORM, minimal deps), consistent
  with "use migration files for schema."
- Location: `Backend/src/db/migrations/NNNN_description.sql` (zero-padded,
  ordered). Each file is plain SQL, forward-only for Phase 1 (no down files
  required; recreate the DB to reset locally).
- A runner script `Backend/src/db/migrate.js`:
  - Ensures a `schema_migrations(version text primary key, applied_at timestamptz
    default now())` table.
  - Reads migration files in lexical order, skips already-applied versions, runs
    each remaining file inside a transaction, records the version.
  - Exposed via `npm run migrate` in `Backend/package.json`.
- Alternative allowed: `node-pg-migrate`. If used, keep the same file location and
  the same `npm run migrate` entry point. Pick one and document it in the README.

### 1.6 Naming
- Tables: `snake_case`, plural (`menu_items`, `purchase_orders`).
- Columns: `snake_case`. FKs: `<referenced_singular>_id` (`supplier_id`).
- Enums: `snake_case` type name, `snake_case` values.
- Indexes: `idx_<table>_<cols>`. Unique constraints: `uq_<table>_<cols>`.

## 2. Two inventory concepts (important, avoids confusion)

The assessment lists **both** "Ingredient Management" and "Product / Warehouse /
Stock" as separate modules. They are modeled as two parallel concepts:

- **Ingredients** = raw kitchen consumables used by recipes (flour, tomato,
  chicken). Stock lives in `ingredients.current_stock`. Reduced by recipe
  consumption / manual adjustment. Drives low-stock alerts and (Phase 2) shortage
  prediction. Ingredients are **not** stored per-warehouse in Phase 1.
- **Products** = general inventory/supply items purchased from suppliers, stored
  in **warehouses**, moved via **stock_movements**, replenished via **purchase
  orders**. This is the supply-chain / store side.

Keep them separate. Do not merge. Both appear on the dashboard low-stock widget.

## 3. Enumerated types

Define these as PostgreSQL `ENUM` types in migration `0001`:

```sql
CREATE TYPE user_role AS ENUM
  ('owner', 'manager', 'chef', 'waiter', 'cashier', 'store_manager');

CREATE TYPE table_status AS ENUM
  ('available', 'occupied', 'reserved', 'out_of_service');

CREATE TYPE order_type AS ENUM
  ('dine_in', 'takeaway', 'delivery');

CREATE TYPE order_status AS ENUM
  ('open', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'completed', 'cancelled');

CREATE TYPE payment_status AS ENUM
  ('unpaid', 'paid', 'refunded');

CREATE TYPE payment_method AS ENUM
  ('cash', 'card', 'upi', 'bank_transfer', 'other');

CREATE TYPE stock_movement_type AS ENUM
  ('stock_in', 'stock_out', 'adjustment', 'wastage', 'transfer');

CREATE TYPE purchase_order_status AS ENUM
  ('draft', 'ordered', 'partially_received', 'received', 'cancelled');

CREATE TYPE invoice_status AS ENUM
  ('pending', 'verified', 'paid', 'disputed');

CREATE TYPE measurement_unit AS ENUM
  ('kg', 'g', 'l', 'ml', 'unit', 'pack', 'dozen', 'box');
```

> Enum evolution: adding a value later uses `ALTER TYPE ... ADD VALUE` in a new
> migration. Never edit an applied migration.

## 4. Shared trigger (migration 0001)

```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
Attach to every table:
```sql
CREATE TRIGGER trg_<table>_updated_at
  BEFORE UPDATE ON <table>
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

## 5. Tables

Grouped by domain. Column notes call out constraints, indexes, and FK behavior.
`created_at`/`updated_at` are omitted from each listing but present on **every**
table per §1.2.

### 5.1 Identity & profile

#### `users` (also the staff directory)
| Column          | Type            | Constraints / Notes                                  |
|-----------------|-----------------|------------------------------------------------------|
| id              | bigint identity | PK                                                    |
| full_name       | text            | NOT NULL                                              |
| email           | citext / text   | NOT NULL, UNIQUE (`uq_users_email`), lowercased       |
| password_hash   | text            | NOT NULL (bcrypt hash)                                |
| role            | user_role       | NOT NULL                                              |
| phone           | text            | NULL                                                  |
| is_active       | boolean         | NOT NULL DEFAULT true                                 |
| last_login_at   | timestamptz     | NULL                                                  |

- Index: `idx_users_role`. Unique: email.
- `users` doubles as the Staff Management directory (spec `09`). No separate
  `staff` table. Role distinguishes staff type.
- If `citext` extension is undesirable, store `email` as text and always
  lowercase before insert/compare; keep the unique index.

#### `restaurant_profile` (single-row config)
| Column        | Type          | Notes                                    |
|---------------|---------------|------------------------------------------|
| id            | int           | PK, DEFAULT 1, CHECK (id = 1). Not identity, so a failed insert cannot advance a sequence and orphan id = 1. Single-row guard: a second insert collides on the PK. |
| name          | text          | NOT NULL                                 |
| address       | text          | NULL                                     |
| phone         | text          | NULL                                     |
| email         | text          | NULL                                     |
| currency_code | text          | NOT NULL DEFAULT 'INR'                    |
| tax_rate      | numeric(5,2)  | NOT NULL DEFAULT 0 (percent, e.g. 5.00)  |
| timezone      | text          | NOT NULL DEFAULT 'Asia/Kolkata'          |
| logo_url      | text          | NULL                                     |

- Seeded with exactly one row. Used for currency/tax on orders and invoices.

### 5.2 Front-of-house: tables, menu, orders, recipes

#### `restaurant_tables`
| Column     | Type            | Notes                                            |
|------------|-----------------|--------------------------------------------------|
| id         | bigint identity | PK                                               |
| label      | text            | NOT NULL, UNIQUE (`uq_restaurant_tables_label`)  |
| capacity   | int             | NOT NULL, CHECK (capacity > 0)                   |
| section    | text            | NULL (e.g. 'Indoor', 'Patio', 'Bar')             |
| status     | table_status    | NOT NULL DEFAULT 'available'                      |

- Named `restaurant_tables` to avoid ambiguity with the SQL word "tables".
- Index: `idx_restaurant_tables_status`.

#### `menu_categories`
| Column      | Type            | Notes                               |
|-------------|-----------------|-------------------------------------|
| id          | bigint identity | PK                                  |
| name        | text            | NOT NULL, UNIQUE (`uq_menu_categories_name`) |
| description | text            | NULL                                |
| sort_order  | int             | NOT NULL DEFAULT 0                  |
| is_active   | boolean         | NOT NULL DEFAULT true               |

#### `menu_items`
| Column            | Type            | Notes                                          |
|-------------------|-----------------|------------------------------------------------|
| id                | bigint identity | PK                                             |
| category_id       | bigint          | NOT NULL, FK → menu_categories(id) ON DELETE RESTRICT |
| name              | text            | NOT NULL                                       |
| description       | text            | NULL                                           |
| price             | numeric(12,2)   | NOT NULL, CHECK (price >= 0)                    |
| cost              | numeric(12,2)   | NULL (est. cost, used for profit; may derive from recipe) |
| prep_time_minutes | int             | NULL, CHECK (prep_time_minutes >= 0)           |
| is_available      | boolean         | NOT NULL DEFAULT true                          |
| is_active         | boolean         | NOT NULL DEFAULT true (soft-delete flag, §1.4) |
| image_url         | text            | NULL                                           |

- Unique: `uq_menu_items_category_name` on (category_id, name).
- Index: `idx_menu_items_category_id`, `idx_menu_items_is_available`, `idx_menu_items_is_active`.
- `is_available` = temporarily out of stock; `is_active` = removed from menu
  (soft delete). Added in migration `0010`.

#### `recipes`
| Column            | Type            | Notes                                          |
|-------------------|-----------------|------------------------------------------------|
| id                | bigint identity | PK                                             |
| menu_item_id      | bigint          | NOT NULL, UNIQUE, FK → menu_items(id) ON DELETE CASCADE |
| yield_servings    | int             | NOT NULL DEFAULT 1, CHECK (yield_servings > 0) |
| instructions      | text            | NULL                                           |
| prep_time_minutes | int             | NULL                                           |

- One recipe per menu item (UNIQUE menu_item_id).

#### `recipe_ingredients` (join: recipe ↔ ingredient)
| Column        | Type            | Notes                                          |
|---------------|-----------------|------------------------------------------------|
| id            | bigint identity | PK                                             |
| recipe_id     | bigint          | NOT NULL, FK → recipes(id) ON DELETE CASCADE   |
| ingredient_id | bigint          | NOT NULL, FK → ingredients(id) ON DELETE RESTRICT |
| quantity      | numeric(12,3)   | NOT NULL, CHECK (quantity > 0)                 |
| unit          | measurement_unit| NOT NULL                                       |

- Unique: `uq_recipe_ingredients_recipe_ingredient` on (recipe_id, ingredient_id).

#### `orders`
| Column          | Type            | Notes                                              |
|-----------------|-----------------|----------------------------------------------------|
| id              | bigint identity | PK                                                 |
| order_number    | text            | NOT NULL, UNIQUE (`uq_orders_order_number`), e.g. `ORD-2026-000123` |
| table_id        | bigint          | NULL, FK → restaurant_tables(id) ON DELETE SET NULL (null for takeaway/delivery) |
| order_type      | order_type      | NOT NULL DEFAULT 'dine_in'                          |
| status          | order_status    | NOT NULL DEFAULT 'open'                             |
| waiter_id       | bigint          | NULL, FK → users(id) ON DELETE SET NULL            |
| subtotal        | numeric(12,2)   | NOT NULL DEFAULT 0                                  |
| tax             | numeric(12,2)   | NOT NULL DEFAULT 0                                  |
| discount        | numeric(12,2)   | NOT NULL DEFAULT 0                                  |
| total           | numeric(12,2)   | NOT NULL DEFAULT 0                                  |
| payment_status  | payment_status  | NOT NULL DEFAULT 'unpaid'                           |
| payment_method  | payment_method  | NULL                                                |
| notes           | text            | NULL                                                |
| placed_at       | timestamptz     | NULL (set when leaving 'open')                     |
| completed_at    | timestamptz     | NULL (set when status → completed)                 |

- Indexes: `idx_orders_status`, `idx_orders_table_id`, `idx_orders_created_at`,
  `idx_orders_payment_status`.
- Totals are recomputed by the service from `order_items`; never trust client
  totals (see spec `06`).

#### `order_items`
| Column        | Type            | Notes                                              |
|---------------|-----------------|----------------------------------------------------|
| id            | bigint identity | PK                                                 |
| order_id      | bigint          | NOT NULL, FK → orders(id) ON DELETE CASCADE        |
| menu_item_id  | bigint          | NOT NULL, FK → menu_items(id) ON DELETE RESTRICT   |
| item_name     | text            | NOT NULL (snapshot of menu item name at order time)|
| quantity      | int             | NOT NULL, CHECK (quantity > 0)                     |
| unit_price    | numeric(12,2)   | NOT NULL (snapshot of price at order time)         |
| line_total    | numeric(12,2)   | NOT NULL (quantity * unit_price)                   |
| notes         | text            | NULL                                                |

- Index: `idx_order_items_order_id`.
- Price/name are snapshotted so historical orders are stable if the menu changes.

### 5.3 Supply chain: suppliers, ingredients, products, warehouses, stock, POs

#### `suppliers`
| Column         | Type            | Notes                                    |
|----------------|-----------------|------------------------------------------|
| id             | bigint identity | PK                                       |
| name           | text            | NOT NULL, UNIQUE (`uq_suppliers_name`)   |
| contact_name   | text            | NULL                                     |
| email          | text            | NULL                                     |
| phone          | text            | NULL                                     |
| address        | text            | NULL                                     |
| payment_terms  | text            | NULL (e.g. 'Net 30')                     |
| is_active      | boolean         | NOT NULL DEFAULT true                    |

#### `ingredients`
| Column         | Type            | Notes                                          |
|----------------|-----------------|------------------------------------------------|
| id             | bigint identity | PK                                             |
| name           | text            | NOT NULL, UNIQUE (`uq_ingredients_name`)       |
| unit           | measurement_unit| NOT NULL                                       |
| current_stock  | numeric(12,3)   | NOT NULL DEFAULT 0, CHECK (current_stock >= 0) |
| reorder_level  | numeric(12,3)   | NOT NULL DEFAULT 0 (low-stock threshold)       |
| cost_per_unit  | numeric(12,2)   | NOT NULL DEFAULT 0                             |
| supplier_id    | bigint          | NULL, FK → suppliers(id) ON DELETE SET NULL   |
| is_active      | boolean         | NOT NULL DEFAULT true                          |

- Index: `idx_ingredients_supplier_id`.
- Low stock = `current_stock <= reorder_level`.

#### `product_categories`
| Column      | Type            | Notes                                   |
|-------------|-----------------|-----------------------------------------|
| id          | bigint identity | PK                                      |
| name        | text            | NOT NULL, UNIQUE (`uq_product_categories_name`) |
| description | text            | NULL                                    |
| is_active   | boolean         | NOT NULL DEFAULT true                   |

> Distinct from `menu_categories`. This categorizes inventory **products**.

#### `products`
| Column         | Type            | Notes                                              |
|----------------|-----------------|----------------------------------------------------|
| id             | bigint identity | PK                                                 |
| sku            | text            | NOT NULL, UNIQUE (`uq_products_sku`)               |
| name           | text            | NOT NULL                                           |
| category_id    | bigint          | NULL, FK → product_categories(id) ON DELETE SET NULL |
| unit           | measurement_unit| NOT NULL                                           |
| current_stock  | numeric(12,3)   | NOT NULL DEFAULT 0, CHECK (current_stock >= 0)     |
| reorder_level  | numeric(12,3)   | NOT NULL DEFAULT 0                                 |
| cost_price     | numeric(12,2)   | NOT NULL DEFAULT 0                                 |
| supplier_id    | bigint          | NULL, FK → suppliers(id) ON DELETE SET NULL       |
| warehouse_id   | bigint          | NULL, FK → warehouses(id) ON DELETE SET NULL (primary/home warehouse) |
| is_active      | boolean         | NOT NULL DEFAULT true                              |

- Indexes: `idx_products_category_id`, `idx_products_supplier_id`,
  `idx_products_warehouse_id`.
- `current_stock` is the source of truth, kept in sync by stock movements and PO
  receiving inside DB transactions (spec `07`).

#### `warehouses` (Warehouse / Store Management)
| Column    | Type            | Notes                                          |
|-----------|-----------------|------------------------------------------------|
| id        | bigint identity | PK                                             |
| name      | text            | NOT NULL, UNIQUE (`uq_warehouses_name`)        |
| location  | text            | NULL                                           |
| type      | text            | NOT NULL DEFAULT 'store' (e.g. 'store','kitchen') |
| is_active | boolean         | NOT NULL DEFAULT true                          |

#### `stock_movements` (Stock In / Stock Out ledger)
| Column        | Type              | Notes                                          |
|---------------|-------------------|------------------------------------------------|
| id            | bigint identity   | PK                                             |
| product_id    | bigint            | NOT NULL, FK → products(id) ON DELETE RESTRICT |
| warehouse_id  | bigint            | NOT NULL, FK → warehouses(id) ON DELETE RESTRICT |
| movement_type | stock_movement_type | NOT NULL                                     |
| quantity      | numeric(12,3)     | NOT NULL, CHECK (quantity > 0)                 |
| unit_cost     | numeric(12,2)     | NULL (cost at movement time, for valuation)    |
| reference     | text              | NULL (e.g. PO number, order id)                |
| reason        | text              | NULL                                           |
| created_by    | bigint            | NULL, FK → users(id) ON DELETE SET NULL       |

- Index: `idx_stock_movements_product_id`, `idx_stock_movements_created_at`.
- Sign convention: `quantity` is always positive; direction is derived from
  `movement_type` (`stock_in`/`transfer`-in add; `stock_out`/`wastage` subtract;
  `adjustment` uses reason). The service applies the delta to
  `products.current_stock` in the same transaction.

#### `purchase_orders`
| Column        | Type                  | Notes                                       |
|---------------|-----------------------|---------------------------------------------|
| id            | bigint identity       | PK                                          |
| po_number     | text                  | NOT NULL, UNIQUE (`uq_purchase_orders_po_number`), e.g. `PO-2026-000045` |
| supplier_id   | bigint                | NOT NULL, FK → suppliers(id) ON DELETE RESTRICT |
| warehouse_id  | bigint                | NOT NULL, FK → warehouses(id) ON DELETE RESTRICT |
| status        | purchase_order_status | NOT NULL DEFAULT 'draft'                    |
| order_date    | date                  | NULL                                        |
| expected_date | date                  | NULL                                        |
| received_date | date                  | NULL                                        |
| subtotal      | numeric(12,2)         | NOT NULL DEFAULT 0                           |
| tax           | numeric(12,2)         | NOT NULL DEFAULT 0                           |
| total         | numeric(12,2)         | NOT NULL DEFAULT 0                           |
| notes         | text                  | NULL                                        |
| created_by    | bigint                | NULL, FK → users(id) ON DELETE SET NULL     |

- Indexes: `idx_purchase_orders_supplier_id`, `idx_purchase_orders_status`.

#### `purchase_order_items`
| Column            | Type            | Notes                                          |
|-------------------|-----------------|------------------------------------------------|
| id                | bigint identity | PK                                             |
| purchase_order_id | bigint          | NOT NULL, FK → purchase_orders(id) ON DELETE CASCADE |
| product_id        | bigint          | NOT NULL, FK → products(id) ON DELETE RESTRICT |
| quantity_ordered  | numeric(12,3)   | NOT NULL, CHECK (quantity_ordered > 0)         |
| quantity_received | numeric(12,3)   | NOT NULL DEFAULT 0, CHECK (quantity_received >= 0) |
| unit_cost         | numeric(12,2)   | NOT NULL                                       |
| line_total        | numeric(12,2)   | NOT NULL (quantity_ordered * unit_cost)        |

- Index: `idx_purchase_order_items_po_id`.
- Receiving increments `quantity_received`, creates `stock_in` movements, updates
  `products.current_stock`, and moves PO status toward `partially_received` /
  `received` (spec `07`), all in one transaction.

### 5.4 Expenses & invoices

#### `expense_categories`
| Column      | Type            | Notes                                   |
|-------------|-----------------|-----------------------------------------|
| id          | bigint identity | PK                                      |
| name        | text            | NOT NULL, UNIQUE (`uq_expense_categories_name`) |
| description | text            | NULL                                    |
| is_active   | boolean         | NOT NULL DEFAULT true                   |

#### `expense_records`
| Column         | Type            | Notes                                              |
|----------------|-----------------|----------------------------------------------------|
| id             | bigint identity | PK                                                 |
| category_id    | bigint          | NOT NULL, FK → expense_categories(id) ON DELETE RESTRICT |
| supplier_id    | bigint          | NULL, FK → suppliers(id) ON DELETE SET NULL       |
| invoice_id     | bigint          | NULL, FK → supplier_invoices(id) ON DELETE SET NULL (link when expense came from an invoice) |
| description    | text            | NOT NULL                                           |
| amount         | numeric(12,2)   | NOT NULL, CHECK (amount >= 0)                       |
| expense_date   | date            | NOT NULL                                           |
| payment_method | payment_method  | NULL                                                |
| reference      | text            | NULL                                                |
| created_by     | bigint          | NULL, FK → users(id) ON DELETE SET NULL           |

- Indexes: `idx_expense_records_category_id`, `idx_expense_records_expense_date`,
  `idx_expense_records_supplier_id`.
- "Monthly Expense Tracking" is an aggregation over this table (+ optionally
  supplier invoices) grouped by month. See §5.5 view and spec `08`/`10`.

#### `supplier_invoices`
| Column         | Type            | Notes                                              |
|----------------|-----------------|----------------------------------------------------|
| id             | bigint identity | PK                                                 |
| invoice_number | text            | NOT NULL                                           |
| supplier_id    | bigint          | NOT NULL, FK → suppliers(id) ON DELETE RESTRICT   |
| invoice_date   | date            | NULL                                               |
| due_date       | date            | NULL                                               |
| subtotal       | numeric(12,2)   | NOT NULL DEFAULT 0                                  |
| tax            | numeric(12,2)   | NOT NULL DEFAULT 0                                  |
| total          | numeric(12,2)   | NOT NULL DEFAULT 0                                  |
| status         | invoice_status  | NOT NULL DEFAULT 'pending'                          |
| file_url       | text            | NULL (path/URL to uploaded PDF/image)              |
| ocr_raw        | jsonb           | NULL (reserved for Phase 2 OCR output; unused now) |
| notes          | text            | NULL                                                |
| created_by     | bigint          | NULL, FK → users(id) ON DELETE SET NULL           |

- Unique: `uq_supplier_invoices_supplier_number` on (supplier_id, invoice_number).
- Indexes: `idx_supplier_invoices_supplier_id`, `idx_supplier_invoices_status`,
  `idx_supplier_invoices_invoice_date`.
- Phase 1 = manual CRUD + file upload metadata. `ocr_raw` stays null until
  Phase 2. File binaries are stored on disk under `Backend/src/uploads/`; only the
  path/URL is persisted (see upload middleware).

#### `supplier_invoice_items`
| Column      | Type            | Notes                                              |
|-------------|-----------------|----------------------------------------------------|
| id          | bigint identity | PK                                                 |
| invoice_id  | bigint          | NOT NULL, FK → supplier_invoices(id) ON DELETE CASCADE |
| product_id  | bigint          | NULL, FK → products(id) ON DELETE SET NULL        |
| description | text            | NOT NULL                                           |
| quantity    | numeric(12,3)   | NOT NULL, CHECK (quantity > 0)                     |
| unit_price  | numeric(12,2)   | NOT NULL                                           |
| line_total  | numeric(12,2)   | NOT NULL                                           |

- Index: `idx_supplier_invoice_items_invoice_id`.

### 5.5 Reporting helper (optional but recommended)

`monthly_expense_summary` — a SQL **view** (not a table) that powers Monthly
Expense Tracking and the dashboard Monthly Expenses widget:

```sql
CREATE VIEW monthly_expense_summary AS
SELECT
  date_trunc('month', expense_date)::date AS month,
  category_id,
  count(*)      AS record_count,
  sum(amount)   AS total_amount
FROM expense_records
GROUP BY 1, 2;
```
- A view keeps the aggregation in one place and avoids duplicating SQL across
  spec `08` and `10`. If a view is not desired, replicate the query in the
  expenses service. Document whichever is chosen.

## 6. Relationship summary (ERD in words)

- `menu_categories` 1─* `menu_items` 1─1 `recipes` 1─* `recipe_ingredients` *─1 `ingredients`.
- `restaurant_tables` 1─* `orders` 1─* `order_items` *─1 `menu_items`.
- `users` (waiter) 1─* `orders`; `users` created_by across POs, movements, expenses, invoices.
- `suppliers` 1─* `ingredients`, `products`, `purchase_orders`, `supplier_invoices`, `expense_records`.
- `product_categories` 1─* `products`.
- `warehouses` 1─* `products`, `stock_movements`, `purchase_orders`.
- `products` 1─* `stock_movements`, `purchase_order_items`, `supplier_invoice_items`.
- `purchase_orders` 1─* `purchase_order_items`.
- `expense_categories` 1─* `expense_records`.
- `supplier_invoices` 1─* `supplier_invoice_items`; 1─* `expense_records` (optional link).

## 7. Migration file plan

Suggested ordering (adjust names, keep numeric prefixes ascending). Group related
DDL but keep each file focused and under ~300 lines.

| File | Contents |
|------|----------|
| `0001_extensions_enums_and_shared.sql` | `citext` (if used), all ENUM types, `set_updated_at()` function. |
| `0002_users_and_profile.sql` | `users`, `restaurant_profile` + triggers/indexes. |
| `0003_front_of_house.sql` | `restaurant_tables`, `menu_categories`, `menu_items`. |
| `0004_recipes_and_ingredients.sql` | `ingredients`, `recipes`, `recipe_ingredients`. |
| `0005_orders.sql` | `orders`, `order_items`. |
| `0006_suppliers_and_products.sql` | `suppliers`, `product_categories`, `products`, `warehouses`. |
| `0007_stock_and_purchase_orders.sql` | `stock_movements`, `purchase_orders`, `purchase_order_items`. |
| `0008_expenses_and_invoices.sql` | `expense_categories`, `expense_records`, `supplier_invoices`, `supplier_invoice_items`. |
| `0009_views.sql` | `monthly_expense_summary` view. |

- Every `CREATE TABLE` is followed by its indexes and its `set_updated_at`
  trigger in the same file.
- FK ordering: create referenced tables before referencing tables (respect the
  numbering above). `expense_records.invoice_id` → `supplier_invoices`: place
  `supplier_invoices` creation before `expense_records`, or add the FK via
  `ALTER TABLE` after both exist (do the latter in `0008`).

## 8. `npm run migrate` contract

- `Backend/package.json` gains: `"migrate": "node src/db/migrate.js"` and
  `"seed": "node src/db/seed.js"` (seed detailed in spec `02`).
- `migrate.js` connects via the existing `pool` (`config/database.js`), ensures
  `schema_migrations`, applies pending files in a transaction each, logs applied
  versions, exits non-zero on failure.
- Running migrate twice is a no-op (idempotent by version tracking).
- Reset locally by dropping the DB / `docker compose down -v` then re-migrating.

## 9. Acceptance for this spec

- [ ] All enums, tables, indexes, constraints, triggers created by migrations.
- [ ] `npm run migrate` is idempotent and records versions in `schema_migrations`.
- [ ] FK `ON DELETE` behaviors match the tables above.
- [ ] `updated_at` auto-updates on every table via trigger.
- [ ] The schema supports every field referenced by module specs 06–10; any new
      field a module needs is added here first.
