# Phase 1 — Spec 02: Seed Data

> Repeatable demo data so a reviewer sees a populated app locally and on Neon
> using the **same** command. Depends on spec `01` (schema). Table/column names
> here must match `01` exactly.

## 1. Goals

- One command, `npm run seed`, fills every core table with realistic demo data.
- The command is **idempotent**: running it repeatedly does not duplicate rows or
  error. Re-running resets demo data to a known state.
- The **same** command and the **same** dataset run against Neon (hosted). No
  manual data entry in the final demo (AGENTS.md data rule).
- Every role has a documented login so reviewers can test RBAC.

## 2. Runner design

- File: `Backend/src/db/seed.js` (currently a stub). Uses the shared `pool`.
- `npm run seed` in `Backend/package.json` (added alongside `migrate`).
- Runs **after** migrations. Assumes schema exists; does not create tables.
- Wrap the whole seed in a single transaction. On any error, roll back and exit
  non-zero, leaving the DB unchanged.

### 2.1 Idempotency strategy
Choose one and apply consistently (recommended: **truncate + reinsert**):

- **Truncate + reinsert (recommended for demo):** At the top of the seed, in the
  transaction, `TRUNCATE` all core tables with `RESTART IDENTITY CASCADE` in FK-safe
  order (or truncate the whole set in one statement listing all tables). Then
  insert fresh. This guarantees a clean, deterministic dataset every run.
  - Guard with an env flag `SEED_RESET=true` (default true in dev). Refuse to
    truncate if `NODE_ENV === 'production'` unless `SEED_ALLOW_PROD=true` is set,
    so Neon is only reset intentionally.
- **Upsert (`INSERT ... ON CONFLICT DO UPDATE`):** keyed on natural unique columns
  (email, sku, names, numbers). Safer for shared environments but more verbose.
  Use if truncation on Neon is undesirable.

Document the chosen approach in the README.

### 2.2 Insert order (respects FKs)
1. `restaurant_profile`
2. `users`
3. `suppliers`
4. `warehouses`, `product_categories`, `menu_categories`, `expense_categories`
5. `ingredients` (FK → suppliers)
6. `products` (FK → product_categories, suppliers, warehouses)
7. `menu_items` (FK → menu_categories)
8. `recipes` (FK → menu_items), `recipe_ingredients` (FK → recipes, ingredients)
9. `restaurant_tables`
10. `stock_movements` (FK → products, warehouses, users)
11. `purchase_orders` + `purchase_order_items`
12. `supplier_invoices` + `supplier_invoice_items`
13. `expense_records` (FK → expense_categories, suppliers, invoices)
14. `orders` + `order_items` (FK → tables, users, menu_items)

Capture generated ids using `RETURNING id` and hold them in JS variables/maps to
wire FKs, since PKs are identity columns (spec `01` §1.1).

## 3. Test users & credentials (authoritative)

Seed one user per role. Passwords are hashed with bcrypt at seed time (never store
plaintext). Document these credentials in the README "Test user credentials"
section verbatim.

| Role          | Email                        | Password        | full_name        |
|---------------|------------------------------|-----------------|------------------|
| owner         | owner@restaurantos.test      | Owner@123       | Olivia Owner     |
| manager       | manager@restaurantos.test    | Manager@123     | Marcus Manager   |
| chef          | chef@restaurantos.test       | Chef@123        | Chandra Chef     |
| waiter        | waiter@restaurantos.test     | Waiter@123      | Wade Waiter      |
| cashier       | cashier@restaurantos.test    | Cashier@123     | Cassie Cashier   |
| store_manager | store@restaurantos.test      | Store@123       | Sam Store        |

- All `is_active = true`. Add 2–3 extra staff (e.g. a second waiter, second chef)
  so Staff Management lists are non-trivial.
- Hash with the same bcrypt cost factor used by the auth service (spec `03`, cost
  10). Do not hardcode a pre-computed hash; hash in the seed script so a password
  change stays in sync.

## 4. Demo dataset (minimums)

Aim for enough rows that lists paginate and the dashboard looks real. Suggested
volumes — exceed if quick, never fall below:

| Entity                 | Min rows | Notes                                                  |
|------------------------|----------|--------------------------------------------------------|
| restaurant_profile     | 1        | Name e.g. "Spice Route Kitchen", currency INR, tax 5%. |
| users                  | 8–10     | 6 role users above + extras.                           |
| suppliers              | 6        | Mix of food, beverage, packaging suppliers.            |
| warehouses             | 2–3      | e.g. "Main Store", "Kitchen Store".                    |
| product_categories     | 5        | e.g. Dry Goods, Beverages, Packaging, Cleaning, Dairy. |
| menu_categories        | 5–6      | Starters, Mains, Breads, Desserts, Beverages.          |
| expense_categories     | 6        | Rent, Utilities, Salaries, Supplies, Maintenance, Misc.|
| ingredients            | 20–30    | Realistic units + reorder levels; some below reorder.  |
| products               | 20–30    | SKUs, stock, some below reorder for low-stock widget.  |
| menu_items             | 25–35    | Spread across categories, realistic prices.            |
| recipes                | 15–20    | For a subset of menu items, with 3–6 ingredients each. |
| recipe_ingredients     | 60+      | Join rows for the recipes above.                       |
| restaurant_tables      | 12–15    | Mixed sections + statuses (some occupied/reserved).    |
| purchase_orders        | 8–10     | Mixed statuses incl. draft, ordered, received.         |
| purchase_order_items   | 25+      | 2–4 lines per PO.                                       |
| stock_movements        | 30+      | stock_in from received POs + some stock_out/wastage.   |
| supplier_invoices      | 8–10     | Mixed statuses; a couple linked to expense_records.    |
| supplier_invoice_items | 25+      | 2–4 lines per invoice.                                  |
| expense_records        | 40–60    | Spread across the **last 6 months** for monthly charts.|
| orders                 | 40–60    | Spread across recent days; mixed status/payment/type.  |
| order_items            | 120+     | 2–5 items per order, snapshot name+price.              |

### 4.1 Data realism rules
- **Dates:** spread `orders.created_at`, `expense_records.expense_date`, and PO
  dates across the **last 6 months** so time-series widgets have shape. Since
  `Date.now()` is fine in the seed runtime (Node, not the workflow sandbox), use
  real relative dates; but prefer generating from a fixed "as of" date passed via
  env (`SEED_AS_OF`, default today) for reproducibility.
- **Low stock:** ensure at least 4–6 `ingredients` and 4–6 `products` have
  `current_stock <= reorder_level` so the low-stock widget is populated.
- **Active orders:** leave several `orders` in non-terminal statuses
  (`open`, `preparing`, `ready`) so the Active Orders widget and Table Occupancy
  are non-empty; set matching `restaurant_tables.status = 'occupied'`.
- **Payments/profit:** mark a realistic share of orders `payment_status = 'paid'`
  with totals so Sales Overview and Profit Overview compute sensibly. Ensure
  `menu_items.cost` (or recipe-derived cost) is set so profit = revenue − cost is
  meaningful.
- **Consistency:** `order_items.line_total = quantity * unit_price`; order
  `subtotal/tax/discount/total` consistent with items and profile tax rate. PO and
  invoice totals equal the sum of their line totals + tax.
- **Received POs:** for POs in `received`/`partially_received`, create matching
  `stock_movements` (stock_in) and reflect them in `products.current_stock` so the
  ledger and stock balances agree.

## 5. Structure of the seed script

Keep `seed.js` orchestration thin; move data and helpers into
`Backend/src/db/seeds/` (folder already exists with `.gitkeep`):

```
Backend/src/db/seeds/
  index.js            # optional aggregator
  users.seed.js       # returns/inserts users, exports hashing helper usage
  suppliers.seed.js
  catalog.seed.js     # menu categories/items, product categories/products
  inventory.seed.js   # ingredients, warehouses, stock movements
  recipes.seed.js
  orders.seed.js
  purchasing.seed.js  # purchase orders + items
  expenses.seed.js    # expense categories/records, supplier invoices + items
  tables.seed.js
```
- `seed.js` opens a transaction, calls each seed module in the FK-safe order from
  §2.2, passing forward id maps, then commits.
- Keep each seed file under ~300 lines; split by entity if needed.
- No `Math.random()`-dependent uniqueness that breaks reproducibility; if
  randomizing, seed a deterministic PRNG or use index-based variation.

## 6. Neon parity

- The seed uses `DATABASE_URL`. Point it at Neon and run `npm run migrate &&
  npm run seed` to populate the hosted DB identically.
- Guard truncation in production as described in §2.1 so Neon is only reset when
  intended (`SEED_ALLOW_PROD=true`).
- Do **not** rely on any manually entered local rows for the demo; everything a
  reviewer sees must come from this seed.

## 7. Acceptance for this spec

- [ ] `npm run seed` runs clean after `npm run migrate` on an empty DB.
- [ ] Re-running `npm run seed` does not duplicate or error (idempotent).
- [ ] All 6 role logins work with the documented passwords.
- [ ] Low-stock, active-order, occupancy, monthly-expense, and sales widgets are
      non-empty from seeded data.
- [ ] Totals and ledgers are internally consistent (orders, POs, invoices,
      stock movements vs balances).
- [ ] Running the same command against Neon yields the same dataset.
