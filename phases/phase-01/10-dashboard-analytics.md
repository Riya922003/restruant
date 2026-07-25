# Phase 1 — Spec 10: Dashboard Analytics

> The read-only analytics backend that powers the RestaurantOS dashboard. It
> exposes the 8 widgets required by `AGENTS.md` as aggregate queries over the
> schema in spec `01`. Depends on: spec `01` (tables/columns/indexes referenced
> verbatim), spec `04` (RBAC — dashboard readable by all authenticated roles),
> spec `05` (module anatomy, response envelope, error flow). Seed data from spec
> `02` **must** populate the underlying tables so every widget returns non-empty
> data. This module is aggregation-only: no writes, no transactions.

## 1. Design decision: one summary endpoint + optional per-widget endpoints

The dashboard renders all 8 widgets on a single page load. Making 8 round trips
on first paint is wasteful, so the **primary** endpoint is a single aggregate:

- **Primary:** `GET /api/dashboard/summary` returns **all 8 widgets** in one
  `{ data: {...} }` payload. The frontend calls this once on page mount.
- **Optional (per-widget refresh):** each widget also has its own endpoint so a
  single card can be refreshed without recomputing the whole dashboard. These are
  thin wrappers over the same service functions used by `/summary`.

Both are documented below. `/summary` is the one the frontend uses by default;
the per-widget endpoints are additive and share the exact same JSON shape per
widget.

### 1.1 Endpoint list

| Method & path                          | Widget                | Notes                              |
|----------------------------------------|-----------------------|------------------------------------|
| `GET /api/dashboard/summary`           | all 8 (primary)       | one payload, `?range=` applies     |
| `GET /api/dashboard/sales`             | Sales Overview        | `?range=`                          |
| `GET /api/dashboard/active-orders`     | Active Orders         | not range-dependent (live)         |
| `GET /api/dashboard/table-occupancy`   | Table Occupancy       | not range-dependent (live)         |
| `GET /api/dashboard/low-stock`         | Low Stock Items       | not range-dependent (live)         |
| `GET /api/dashboard/monthly-expenses`  | Monthly Expenses      | current calendar year              |
| `GET /api/dashboard/purchase-summary`  | Purchase Summary      | `?range=`                          |
| `GET /api/dashboard/profit`            | Profit Overview       | `?range=`                          |
| `GET /api/dashboard/supplier-summary`  | Supplier Summary      | `?range=` (spend), plus live A/P   |

### 1.2 The `range` query param

Where a widget is time-bounded, accept an optional `range`:

| `range`  | Meaning                                    | Window computed as                          |
|----------|--------------------------------------------|---------------------------------------------|
| `7d`     | Trailing 7 days                            | `created_at >= now() - interval '7 days'`   |
| `30d`    | Trailing 30 days (**default**)             | `created_at >= now() - interval '30 days'`  |
| `month`  | Current calendar month to date             | `>= date_trunc('month', now())`             |

- Default when omitted or invalid: `30d`.
- Validated by a Zod `querySchema` (`range: z.enum(['7d','30d','month']).default('30d')`).
- The service resolves `range` to a single interval/boundary and passes it as a
  bound SQL parameter. Never interpolate the raw value into SQL.
- Widgets that are inherently "live" (Active Orders, Table Occupancy, Low Stock)
  ignore `range` — they always reflect current state.

### 1.3 Module anatomy (per spec 05)

```
Backend/src/modules/dashboard/
  dashboard.routes.js       # mount: authMiddleware + requireRole(read) + controller
  dashboard.controller.js   # HTTP layer: parse range, call service, envelope
  dashboard.service.js      # 8 aggregation functions + getSummary() (Promise.all)
  dashboard.validation.js   # querySchema: { range }
```

- No `repository.js` unless the service exceeds ~300 lines (spec `05` §1).
- Controllers contain no SQL; all SQL lives in the service.
- Money/quantity `numeric` columns come back from `pg` as strings; cast to numbers
  in the service mapper for clean JSON, consistent with spec `05` §6.

### 1.4 Route mount (replaces the current stub)

The existing `dashboard.routes.js` returns `{ module, status: "pending" }` from
`GET /summary`. Replace it with the real mount:

```js
const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const { querySchema } = require("./dashboard.validation");
const ctrl = require("./dashboard.controller");

// Dashboard is readable by every authenticated role (spec 04). Owner bypass
// still applies inside requireRole. See section 12 for the optional stricter cut.
const canRead = requireRole(
  "owner", "manager", "chef", "waiter", "cashier", "store_manager"
);

function mountDashboardRoutes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/summary",          canRead, validate(querySchema, "query"), ctrl.summary);
  router.get("/sales",            canRead, validate(querySchema, "query"), ctrl.sales);
  router.get("/active-orders",    canRead, ctrl.activeOrders);
  router.get("/table-occupancy",  canRead, ctrl.tableOccupancy);
  router.get("/low-stock",        canRead, ctrl.lowStock);
  router.get("/monthly-expenses", canRead, ctrl.monthlyExpenses);
  router.get("/purchase-summary", canRead, validate(querySchema, "query"), ctrl.purchaseSummary);
  router.get("/profit",           canRead, validate(querySchema, "query"), ctrl.profit);
  router.get("/supplier-summary", canRead, validate(querySchema, "query"), ctrl.supplierSummary);

  parentRouter.use("/dashboard", router);
}
module.exports = mountDashboardRoutes;
```

## 2. Widget 1 — Sales Overview

**What it shows:** Revenue performance over the selected range. Total sales
amount, order count, average order value, and a per-day time series for a trend
chart. "Sales" = orders that have been **paid** (revenue actually realised).

**Source (spec 01 §5.2):** `orders` — `total`, `payment_status`, `created_at`,
`status`. Revenue counts orders where `payment_status = 'paid'` and the order is
not `cancelled`. Uses `idx_orders_payment_status`, `idx_orders_created_at`,
`idx_orders_status`.

**Aggregation logic:** filter to `payment_status = 'paid'` and
`status <> 'cancelled'` within the range window. Sum `total` (gross sales), count
rows (paid order count), average `total` (average order value). Separately group
by day for the trend series.

```sql
-- $1 = range start boundary (timestamptz), e.g. now() - interval '30 days'
-- Headline totals
SELECT
  coalesce(sum(total), 0)                                  AS total_sales,
  count(*)                                                 AS order_count,
  coalesce(round(avg(total), 2), 0)                        AS average_order_value
FROM orders
WHERE payment_status = 'paid'
  AND status <> 'cancelled'
  AND created_at >= $1;

-- Per-day time series for the trend chart
SELECT
  date_trunc('day', created_at)::date AS day,
  coalesce(sum(total), 0)             AS sales,
  count(*)                            AS orders
FROM orders
WHERE payment_status = 'paid'
  AND status <> 'cancelled'
  AND created_at >= $1
GROUP BY 1
ORDER BY 1 ASC;
```

**Response shape:**

```json
{
  "data": {
    "range": "30d",
    "total_sales": 184230.50,
    "order_count": 512,
    "average_order_value": 359.83,
    "series": [
      { "day": "2026-06-26", "sales": 5120.00, "orders": 14 },
      { "day": "2026-06-27", "sales": 6340.50, "orders": 18 }
    ]
  }
}
```

## 3. Widget 2 — Active Orders

**What it shows:** Orders currently in flight (open on the floor or moving through
the kitchen), so staff see live workload. A count plus a short list of the active
orders.

**Source (spec 01 §5.2):** `orders` — `id`, `order_number`, `table_id`, `status`,
`order_type`, `total`, `created_at`, joined to `restaurant_tables.label`. Uses
`idx_orders_status`.

**Aggregation logic:** "active" = `status IN ('open','sent_to_kitchen',
'preparing','ready','served')` (everything before `completed`/`cancelled`).
Count them, and return the list ordered oldest-first (longest-waiting on top).

```sql
-- Count of active orders
SELECT count(*) AS active_count
FROM orders
WHERE status IN ('open','sent_to_kitchen','preparing','ready','served');

-- List (oldest first); cap the list for the widget
SELECT
  o.id,
  o.order_number,
  o.status,
  o.order_type,
  o.total,
  o.created_at,
  t.label AS table_label
FROM orders o
LEFT JOIN restaurant_tables t ON t.id = o.table_id
WHERE o.status IN ('open','sent_to_kitchen','preparing','ready','served')
ORDER BY o.created_at ASC
LIMIT 20;
```

**Response shape:**

```json
{
  "data": {
    "active_count": 7,
    "orders": [
      {
        "id": 1042,
        "order_number": "ORD-2026-001042",
        "status": "preparing",
        "order_type": "dine_in",
        "total": 720.00,
        "table_label": "T-12",
        "created_at": "2026-07-25T12:04:11.000Z"
      }
    ]
  }
}
```

## 4. Widget 3 — Table Occupancy

**What it shows:** Front-of-house capacity at a glance: how many tables are
available, occupied, reserved, or out of service, and the occupancy percentage.

**Source (spec 01 §5.2):** `restaurant_tables` — `status`. Uses
`idx_restaurant_tables_status`.

**Aggregation logic:** count tables per `status`, total tables, and occupancy % =
`occupied / total * 100`. A single grouped query plus a total; the counts are
pivoted into named fields in the service mapper.

```sql
-- Per-status counts (+ overall total via GROUPING SETS)
SELECT
  status,
  count(*) AS count
FROM restaurant_tables
GROUP BY status;

-- Occupancy percentage in one shot
SELECT
  count(*)                                                              AS total,
  count(*) FILTER (WHERE status = 'occupied')                          AS occupied,
  count(*) FILTER (WHERE status = 'available')                         AS available,
  count(*) FILTER (WHERE status = 'reserved')                          AS reserved,
  count(*) FILTER (WHERE status = 'out_of_service')                    AS out_of_service,
  round(
    100.0 * count(*) FILTER (WHERE status = 'occupied')
    / nullif(count(*), 0), 1)                                          AS occupancy_pct
FROM restaurant_tables;
```

**Response shape:**

```json
{
  "data": {
    "total": 24,
    "occupied": 9,
    "available": 12,
    "reserved": 2,
    "out_of_service": 1,
    "occupancy_pct": 37.5
  }
}
```

## 5. Widget 4 — Low Stock Items

**What it shows:** Everything at or below its reorder threshold, so the store
manager knows what to replenish. Spans **both** inventory concepts from spec `01`
§2: kitchen `ingredients` and supply `products`. Each row is labelled with its
source so the frontend can badge it.

**Source (spec 01 §5.3):** `ingredients` — `name`, `current_stock`,
`reorder_level`, `unit`, `is_active`. `products` — `name`, `sku`, `current_stock`,
`reorder_level`, `unit`, `is_active`. Low stock = `current_stock <= reorder_level`
(spec `01` §5.3).

**Aggregation logic:** `UNION ALL` the two tables, each filtered to active rows
where `current_stock <= reorder_level`, tagging a `source` literal. Order by how
far below threshold each item is (most urgent first).

```sql
SELECT
  'ingredient'::text AS source,
  i.id,
  i.name,
  NULL::text        AS sku,
  i.current_stock,
  i.reorder_level,
  i.unit
FROM ingredients i
WHERE i.is_active = true
  AND i.current_stock <= i.reorder_level

UNION ALL

SELECT
  'product'::text   AS source,
  p.id,
  p.name,
  p.sku,
  p.current_stock,
  p.reorder_level,
  p.unit
FROM products p
WHERE p.is_active = true
  AND p.current_stock <= p.reorder_level

ORDER BY (reorder_level - current_stock) DESC
LIMIT 50;
```

The `low_stock_count` in the response is the row count of the above (before the
`LIMIT`); compute it with a wrapping `SELECT count(*) FROM ( ... ) q`.

**Response shape:**

```json
{
  "data": {
    "low_stock_count": 6,
    "items": [
      {
        "source": "ingredient",
        "id": 14,
        "name": "Tomato",
        "sku": null,
        "current_stock": 2.500,
        "reorder_level": 10.000,
        "unit": "kg"
      },
      {
        "source": "product",
        "id": 88,
        "name": "Napkins (Pack)",
        "sku": "SUP-NAP-01",
        "current_stock": 3.000,
        "reorder_level": 5.000,
        "unit": "pack"
      }
    ]
  }
}
```

## 6. Widget 5 — Monthly Expenses

**What it shows:** Operating spend by month for the current calendar year, plus
the current-month total, so owners track expense trends.

**Source (spec 01 §5.4 / §5.5):** `expense_records` — `amount`, `expense_date`.
Preferably read the `monthly_expense_summary` view (spec `01` §5.5), which already
groups `expense_records` by `date_trunc('month', expense_date)`. Uses
`idx_expense_records_expense_date`.

**Aggregation logic:** roll the view up across categories to one total per month
for the current year, and separately compute the current-month total. This widget
is scoped to the current calendar year (not the generic `range` param).

```sql
-- Per-month totals for the current calendar year (via the view)
SELECT
  month,
  sum(total_amount) AS total_amount,
  sum(record_count) AS record_count
FROM monthly_expense_summary
WHERE month >= date_trunc('year', now())::date
GROUP BY month
ORDER BY month ASC;

-- Current-month total (direct on expense_records for a clean single value)
SELECT coalesce(sum(amount), 0) AS current_month_total
FROM expense_records
WHERE expense_date >= date_trunc('month', now())::date;
```

If the `monthly_expense_summary` view was not created, the first query is
replaced by the equivalent direct aggregate (spec `01` §5.5 documents the choice):

```sql
SELECT
  date_trunc('month', expense_date)::date AS month,
  sum(amount)                             AS total_amount,
  count(*)                                AS record_count
FROM expense_records
WHERE expense_date >= date_trunc('year', now())::date
GROUP BY 1
ORDER BY 1 ASC;
```

**Response shape:**

```json
{
  "data": {
    "year": 2026,
    "current_month_total": 42150.00,
    "months": [
      { "month": "2026-01-01", "total_amount": 38900.00, "record_count": 31 },
      { "month": "2026-02-01", "total_amount": 41200.50, "record_count": 28 }
    ]
  }
}
```

## 7. Widget 6 — Purchase Summary

**What it shows:** Procurement activity: purchase orders by status, total PO value
over the range, and the outstanding (ordered but not yet received) value.

**Source (spec 01 §5.3):** `purchase_orders` — `status`, `total`, `created_at`.
`purchase_order_items` — `quantity_ordered`, `quantity_received`, `unit_cost` (for
the outstanding value). Uses `idx_purchase_orders_status`.

**Aggregation logic:** count POs per `status` and sum `total` within the range
(excluding `cancelled` from the value sum). Outstanding value = the un-received
portion of PO lines for POs still `ordered`/`partially_received`, computed as
`(quantity_ordered - quantity_received) * unit_cost`.

```sql
-- $1 = range start boundary (timestamptz)
-- Counts by status and total value over the range
SELECT
  status,
  count(*)                  AS po_count,
  coalesce(sum(total), 0)   AS total_value
FROM purchase_orders
WHERE created_at >= $1
GROUP BY status;

-- Total PO value over range (excluding cancelled)
SELECT coalesce(sum(total), 0) AS total_po_value
FROM purchase_orders
WHERE created_at >= $1
  AND status <> 'cancelled';

-- Outstanding (ordered but not received) value across open POs
SELECT
  coalesce(sum((poi.quantity_ordered - poi.quantity_received) * poi.unit_cost), 0)
    AS outstanding_value
FROM purchase_order_items poi
JOIN purchase_orders po ON po.id = poi.purchase_order_id
WHERE po.status IN ('ordered', 'partially_received');
```

**Response shape:**

```json
{
  "data": {
    "range": "30d",
    "total_po_value": 96500.00,
    "outstanding_value": 21400.00,
    "by_status": [
      { "status": "draft",              "po_count": 2, "total_value": 8100.00 },
      { "status": "ordered",            "po_count": 5, "total_value": 41200.00 },
      { "status": "partially_received", "po_count": 1, "total_value": 12000.00 },
      { "status": "received",           "po_count": 6, "total_value": 35200.00 },
      { "status": "cancelled",          "po_count": 1, "total_value": 0.00 }
    ]
  }
}
```

## 8. Widget 7 — Profit Overview

**What it shows:** Gross profit over the range: revenue from paid orders minus the
cost of goods sold, plus the profit margin percentage.

**Source (spec 01 §5.2):** revenue from `orders.total` (paid, non-cancelled, in
range). Cost from `order_items.quantity` multiplied by the per-item cost. Cost per
item is taken from `menu_items.cost` (spec `01` §5.2 notes `cost` may be
recipe-derived; Phase 1 uses the stored `menu_items.cost`, defaulting missing
costs to 0). Joins `order_items` → `menu_items`; uses `idx_orders_payment_status`,
`idx_orders_created_at`, `idx_order_items_order_id`.

**Aggregation logic:** revenue = sum of `orders.total` for paid, non-cancelled
orders in range. COGS = sum over the same orders' `order_items` of
`quantity * coalesce(menu_items.cost, 0)`. Gross profit = revenue - COGS. Margin %
= `gross_profit / revenue * 100`.

```sql
-- $1 = range start boundary (timestamptz)
WITH paid_orders AS (
  SELECT id, total
  FROM orders
  WHERE payment_status = 'paid'
    AND status <> 'cancelled'
    AND created_at >= $1
),
revenue AS (
  SELECT coalesce(sum(total), 0) AS total_revenue FROM paid_orders
),
cost AS (
  SELECT coalesce(sum(oi.quantity * coalesce(mi.cost, 0)), 0) AS total_cost
  FROM order_items oi
  JOIN paid_orders po ON po.id = oi.order_id
  JOIN menu_items mi  ON mi.id = oi.menu_item_id
)
SELECT
  revenue.total_revenue,
  cost.total_cost,
  (revenue.total_revenue - cost.total_cost)                        AS gross_profit,
  round(
    100.0 * (revenue.total_revenue - cost.total_cost)
    / nullif(revenue.total_revenue, 0), 1)                         AS margin_pct
FROM revenue, cost;
```

**Response shape:**

```json
{
  "data": {
    "range": "30d",
    "total_revenue": 184230.50,
    "total_cost": 71980.00,
    "gross_profit": 112250.50,
    "margin_pct": 60.9
  }
}
```

## 9. Widget 8 — Supplier Summary

**What it shows:** Supplier relationships at a glance: how many active suppliers,
top suppliers by spend over the range, and total outstanding (unpaid) invoice
value owed.

**Source (spec 01 §5.3 / §5.4):** `suppliers` — `id`, `name`, `is_active`.
`supplier_invoices` — `supplier_id`, `total`, `status`, `invoice_date`. Uses
`idx_supplier_invoices_supplier_id`, `idx_supplier_invoices_status`,
`idx_supplier_invoices_invoice_date`. Spend is measured from supplier invoices
(the amounts actually billed by suppliers).

**Aggregation logic:** count active suppliers; rank suppliers by summed invoice
`total` over the range; sum invoice `total` where `status <> 'paid'` for the
outstanding payables figure.

```sql
-- $1 = range start boundary (date), e.g. (now() - interval '30 days')::date
-- Count of active suppliers
SELECT count(*) AS active_supplier_count
FROM suppliers
WHERE is_active = true;

-- Top suppliers by invoiced spend over the range
SELECT
  s.id,
  s.name,
  coalesce(sum(si.total), 0) AS total_spend,
  count(si.id)               AS invoice_count
FROM suppliers s
JOIN supplier_invoices si ON si.supplier_id = s.id
WHERE si.invoice_date >= $1
GROUP BY s.id, s.name
ORDER BY total_spend DESC
LIMIT 5;

-- Total outstanding (not paid) invoice value
SELECT coalesce(sum(total), 0) AS outstanding_invoice_total
FROM supplier_invoices
WHERE status <> 'paid';
```

**Response shape:**

```json
{
  "data": {
    "range": "30d",
    "active_supplier_count": 12,
    "outstanding_invoice_total": 58200.00,
    "top_suppliers": [
      { "id": 3, "name": "FreshFarm Produce", "total_spend": 42100.00, "invoice_count": 8 },
      { "id": 7, "name": "MetroPack Supplies", "total_spend": 19800.00, "invoice_count": 4 }
    ]
  }
}
```

## 10. Combined `GET /api/dashboard/summary` response

The service runs all 8 widget functions (`Promise.all`) against the same resolved
`range` and nests them under `data`, keyed by widget. Each nested object is the
same shape returned by that widget's individual endpoint (minus the outer
envelope). The top-level `data.range` echoes the resolved range.

```json
{
  "data": {
    "range": "30d",
    "sales_overview": {
      "total_sales": 184230.50,
      "order_count": 512,
      "average_order_value": 359.83,
      "series": [
        { "day": "2026-06-26", "sales": 5120.00, "orders": 14 },
        { "day": "2026-06-27", "sales": 6340.50, "orders": 18 }
      ]
    },
    "active_orders": {
      "active_count": 7,
      "orders": [
        {
          "id": 1042,
          "order_number": "ORD-2026-001042",
          "status": "preparing",
          "order_type": "dine_in",
          "total": 720.00,
          "table_label": "T-12",
          "created_at": "2026-07-25T12:04:11.000Z"
        }
      ]
    },
    "table_occupancy": {
      "total": 24,
      "occupied": 9,
      "available": 12,
      "reserved": 2,
      "out_of_service": 1,
      "occupancy_pct": 37.5
    },
    "low_stock_items": {
      "low_stock_count": 6,
      "items": [
        {
          "source": "ingredient",
          "id": 14,
          "name": "Tomato",
          "sku": null,
          "current_stock": 2.500,
          "reorder_level": 10.000,
          "unit": "kg"
        }
      ]
    },
    "monthly_expenses": {
      "year": 2026,
      "current_month_total": 42150.00,
      "months": [
        { "month": "2026-01-01", "total_amount": 38900.00, "record_count": 31 },
        { "month": "2026-02-01", "total_amount": 41200.50, "record_count": 28 }
      ]
    },
    "purchase_summary": {
      "total_po_value": 96500.00,
      "outstanding_value": 21400.00,
      "by_status": [
        { "status": "ordered",  "po_count": 5, "total_value": 41200.00 },
        { "status": "received", "po_count": 6, "total_value": 35200.00 }
      ]
    },
    "profit_overview": {
      "total_revenue": 184230.50,
      "total_cost": 71980.00,
      "gross_profit": 112250.50,
      "margin_pct": 60.9
    },
    "supplier_summary": {
      "active_supplier_count": 12,
      "outstanding_invoice_total": 58200.00,
      "top_suppliers": [
        { "id": 3, "name": "FreshFarm Produce", "total_spend": 42100.00, "invoice_count": 8 }
      ]
    }
  }
}
```

> Note: `range` is echoed once at `data.range`; the per-widget objects inside
> `/summary` omit their own `range` key to avoid repetition (the individual
> endpoints include `range` because they are standalone).

## 11. RBAC

Per spec `04` §3 (`Dashboard (all widgets)` row) and §3 note `§`:

- **Default (this spec):** the dashboard is **readable by all authenticated
  roles** — `owner`, `manager`, `chef`, `waiter`, `cashier`, `store_manager`.
  Every endpoint above is guarded by `requireRole(<all six roles>)` (owner bypass
  still applies). Missing/invalid token → 401; the role check never fires for an
  authenticated user under the default cut.
- Frontend may hide widgets a given role does not care about — that is **UX only**
  (spec `00` §3, spec `04` §2). The backend still returns the data.

### 11.1 Optional stricter cut (documented, not the default)

If a stricter financial policy is chosen, restrict the financial widgets to
`owner`, `manager`, `store_manager`, `cashier` and return **403** (or omit those
keys from `/summary`) for `chef`/`waiter`:

| Widget            | Default roles | Stricter-cut roles                         |
|-------------------|---------------|--------------------------------------------|
| Sales Overview    | all six       | owner, manager, store_manager, cashier     |
| Monthly Expenses  | all six       | owner, manager, store_manager, cashier     |
| Purchase Summary  | all six       | owner, manager, store_manager, cashier     |
| Profit Overview   | all six       | owner, manager, store_manager, cashier     |
| Active Orders     | all six       | all six                                    |
| Table Occupancy   | all six       | all six                                    |
| Low Stock Items   | all six       | all six                                    |
| Supplier Summary  | all six       | owner, manager, store_manager, cashier     |

Under the stricter cut, `/summary` filters `data` to the widgets the caller's role
may read (rather than 403-ing the whole page). **Default for Phase 1 = all roles
read all widgets**; implement the stricter cut only if the reviewer asks.

## 12. Performance notes

- All queries are **read-only aggregations**. No writes, no transactions.
- They lean on indexes already defined in spec `01`: `idx_orders_status`,
  `idx_orders_created_at`, `idx_orders_payment_status` (Sales, Active Orders,
  Profit), `idx_restaurant_tables_status` (Occupancy),
  `idx_expense_records_expense_date` (Monthly Expenses),
  `idx_purchase_orders_status` (Purchase Summary),
  `idx_supplier_invoices_status` / `idx_supplier_invoices_invoice_date` /
  `idx_supplier_invoices_supplier_id` (Supplier Summary),
  `idx_order_items_order_id` (Profit join).
- `/summary` fans out the 8 functions with `Promise.all` on the shared pool so
  they run concurrently rather than serially.
- At Phase 1 seed volumes these run in single-digit milliseconds; no caching is
  required. **Future (not Phase 1):** if data grows, heavy widgets (Sales series,
  Profit COGS join) can be moved behind a short-TTL cache or a materialized view
  refreshed on a schedule. Note only; do not build in Phase 1.
- `LIMIT` caps are applied to list-bearing widgets (Active Orders 20, Low Stock
  50, Top Suppliers 5) so a single card never returns an unbounded payload.

## 13. Acceptance for this spec

- [ ] `GET /api/dashboard/summary` returns `{ data: {...} }` containing all 8
      widget objects (`sales_overview`, `active_orders`, `table_occupancy`,
      `low_stock_items`, `monthly_expenses`, `purchase_summary`, `profit_overview`,
      `supplier_summary`), each **non-empty** against the seed DB (spec `02`).
- [ ] Each per-widget endpoint (`/sales`, `/active-orders`, `/table-occupancy`,
      `/low-stock`, `/monthly-expenses`, `/purchase-summary`, `/profit`,
      `/supplier-summary`) returns the same shape as its `/summary` sub-object,
      wrapped in `{ data }`.
- [ ] `?range=7d|30d|month` is honoured where applicable; default is `30d`; an
      invalid value is rejected (422) or coerced to `30d` per the Zod schema.
- [ ] All queries use bound parameters (`$1, ...`) — no client input concatenated
      into SQL (spec `05` §5).
- [ ] RBAC: every dashboard route is reachable by all six authenticated roles
      (default cut); missing/invalid token → 401.
- [ ] Envelope compliance: success is `{ data }` (no bare arrays/objects); errors
      flow through the central error middleware (spec `05` §2).
- [ ] Money/quantity values are numbers (not `pg` strings) in the JSON.
- [ ] The old `{ status: "pending" }` stub response is gone from every route.
