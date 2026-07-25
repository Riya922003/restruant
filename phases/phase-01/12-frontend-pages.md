# Phase 1 — Spec 12: Frontend Pages

> Per-route page specifications for the RestaurantOS dashboard. Each module page
> is wired to its real backend endpoint and must render loading/empty/error
> states from live data. Depends on: spec `04` (RBAC matrix — nav gating and
> allowed roles), specs `06`/`07`/`08`/`09`/`10` (backend module endpoints and
> field rules — not yet authored at time of writing, so this spec derives
> endpoints and fields from spec `01` data model, spec `05` conventions, and the
> overview; when 06–10 land, reconcile any endpoint path or field-name drift
> here), and spec `11` (frontend foundation — the API client, auth flow, layout
> shell, and shared UI components this spec consumes). Where spec `11` is not yet
> written, this document names the shared components it assumes exist and expects
> spec `11` to provide them. Frontend permission checks are **UX only**; security
> is enforced server-side (spec `04`).

## 1. Scope and approach

### 1.1 What this spec covers

Every page under `Frontend/app`, wired to the Express API at
`NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api`). All 16 core modules
from `AGENTS.md` plus the dashboard and auth surfaces. No AI, no OCR — the
invoice screen is manual entry with a file attachment and a clearly marked
placeholder region reserved for Phase 2 OCR autofill.

### 1.2 Surfacing modules that lack their own route folder

The existing scaffold has route folders for: `orders`, `tables`, `menu`,
`inventory`, `purchases`, `expenses`, `invoices`, `suppliers`, `staff`, plus the
dashboard overview. Five backend modules have **no** folder yet: **recipes**,
**ingredients**, **product categories**, **expense categories**, and
**warehouses**.

**Recommended approach — tabs/sub-sections over new top-level routes**, because
the sidebar already holds ten items and these five modules are conceptually
children of an existing area. This keeps the nav dense (an AGENTS.md design
goal) and mirrors how operators think ("ingredients live under the kitchen /
menu area", "warehouses live under inventory"). Tabs are implemented as nested
segments so each still has a real, linkable URL and its own data fetch.

Decision:

| Module              | Surfaced as                                    | URL |
|---------------------|------------------------------------------------|-----|
| Recipes             | Tab on the Menu page                           | `/dashboard/menu/recipes` |
| Ingredients         | Tab on the Inventory page                      | `/dashboard/inventory/ingredients` |
| Products            | Default tab on the Inventory page              | `/dashboard/inventory` (or `/dashboard/inventory/products`) |
| Warehouses          | Tab on the Inventory page                      | `/dashboard/inventory/warehouses` |
| Stock movements     | Tab on the Inventory page (ledger)             | `/dashboard/inventory/movements` |
| Product categories  | Tab on the Inventory page (config)             | `/dashboard/inventory/categories` |
| Expense categories  | Tab on the Expenses page                       | `/dashboard/expenses/categories` |
| Monthly tracking    | Tab on the Expenses page (chart view)          | `/dashboard/expenses/monthly` |
| Invoice upload      | Sub-route of Invoices                          | `/dashboard/invoices/new`, `/dashboard/invoices/[id]` |

Tabs are rendered by a shared `<Tabs>` control (spec `11`) inside the parent
page's `layout.tsx`; the active tab is the current nested segment.

### 1.3 Complete list of routes/files to create

```
Frontend/app/
  layout.tsx                              # root (exists) — html/body, providers
  page.tsx                                # root (exists) — redirect to /login or /dashboard
  login/page.tsx                          # exists — implement
  dashboard/
    layout.tsx                            # exists — replace flat nav with role-gated sidebar shell
    page.tsx                              # exists — overview widgets
    orders/
      page.tsx                            # orders board + list
      [id]/page.tsx                       # order detail / ticket (optional; drawer preferred)
    tables/
      page.tsx                            # tables grid
    menu/
      layout.tsx                          # NEW — Menu tabs (Items | Categories | Recipes)
      page.tsx                            # menu items + categories
      recipes/page.tsx                    # NEW — recipes tab
    inventory/
      layout.tsx                          # NEW — Inventory tabs
      page.tsx                            # products (default tab)
      ingredients/page.tsx                # NEW
      warehouses/page.tsx                 # NEW
      movements/page.tsx                  # NEW — stock ledger
      categories/page.tsx                 # NEW — product categories
    purchases/
      page.tsx                            # PO list
      [id]/page.tsx                       # PO detail + receive (optional; drawer preferred)
    expenses/
      layout.tsx                          # NEW — Expenses tabs (Records | Monthly | Categories)
      page.tsx                            # expense records
      monthly/page.tsx                    # NEW — monthly chart
      categories/page.tsx                 # NEW — expense categories
    invoices/
      page.tsx                            # supplier invoice list
      new/page.tsx                        # NEW — upload & manual entry
      [id]/page.tsx                       # NEW — review / edit + file preview
    suppliers/
      page.tsx                            # suppliers list
    staff/
      page.tsx                            # user/staff list
```

## 2. Shared conventions (all pages)

These are assumed to be provided by spec `11`; this spec consumes them.

### 2.1 API client

- `apiClient` (spec `11`) reads `NEXT_PUBLIC_API_URL`, attaches
  `Authorization: Bearer <token>`, and unwraps the `{ data, meta }` envelope
  (spec `00` §6.2). On `401` it clears the session and redirects to `/login`.
- List calls pass `page`, `limit`, `sort`, and module filters as query params
  (spec `05` §5). Responses carry `meta: { page, limit, total, totalPages }`.
- Errors surface the `{ message, errors[] }` envelope (spec `00` §6.3). `422`
  field errors are mapped back onto form fields by `field` name.

### 2.2 Data-fetching states (mandatory on every data view — DoD gate)

Every table/board/grid/chart implements all four:

| State    | Presentation |
|----------|--------------|
| Loading  | Skeleton rows/cards (`<TableSkeleton>` / `<CardSkeleton>`), not a spinner-only screen. Matches final layout density so there is no reflow. |
| Empty    | `<EmptyState>` with an icon, one-line explanation, and a primary CTA that opens the create form (when the role may create). |
| Error    | `<ErrorState>` with the server `message` and a **Retry** button that re-runs the fetch. Never a blank screen. |
| Ready    | The real view. Mutations show inline optimistic or pending state and toast on success/failure. |

### 2.3 Role gating (UX only)

- The sidebar and every primary action button read the current user role from
  the auth context (spec `11`) and the matrix in spec `04`. Buttons a role may
  not use are hidden or disabled; nav items not permitted are omitted.
- This is cosmetic. The backend returns `403` regardless, and the UI must
  surface that `403` gracefully (toast: "You do not have permission…") rather
  than assume the button was always hidden.

### 2.4 Shared components (from spec `11`)

`<PageHeader>`, `<DataTable>` (sortable headers, pagination footer, density
prop), `<Toolbar>` (search + filters + actions), `<Drawer>` and `<Modal>`,
`<FormField>` set (text, number, select, textarea, date, toggle, file),
`<StatusBadge>` (enum → color), `<Tabs>`, `<StatCard>`, `<EmptyState>`,
`<ErrorState>`, skeletons, `<ConfirmDialog>`, `<Toast>`.

### 2.5 Responsive & density (AGENTS.md design rules)

- Operational lists (orders, inventory, stock ledger, POs, invoices, expenses)
  use **dense** table rows: compact padding, tabular-nums for money/quantities,
  right-aligned numeric columns, truncation with tooltips for long text.
- Money renders via a shared `formatCurrency` using `restaurant_profile`
  currency (INR default, spec `01`); never hardcode the symbol in business
  logic. Quantities render with their `measurement_unit`.
- On mobile: tables collapse to stacked cards or horizontal scroll with a frozen
  first column; the sidebar collapses to a top drawer; text must fit containers
  (no clipped labels). No marketing hero anywhere — this is an operational app.
- Consistent spacing scale and typography from the spec `11` design tokens.

### 2.6 Money & number handling

- The backend serializes `numeric` as numbers (spec `05` §6 recommended cast).
  Forms send numbers; validation mirrors the backend Zod rules (non-negative,
  `> 0`, etc.). Totals shown on create forms are **display previews**; the
  server recomputes and returns authoritative totals (orders/POs/invoices).

---

## 3. Auth pages

### 3.1 Login — `Frontend/app/login/page.tsx`

- **Route:** `/login`. Public (no auth). If a valid session already exists,
  redirect to `/dashboard`.
- **Roles:** everyone (unauthenticated). No nav gating (nav not rendered).
- **API:** `POST /api/auth/login` → `{ data: { token, user } }`. On mount, the
  root/layout may call `GET /api/auth/me` to detect an existing session.
- **Layout:** centered card on a plain, non-gradient background (no hero).
  Product name, a short subtitle, the form, and a small "Test credentials" hint
  block (owner/manager/chef/waiter/cashier/store — from spec `02`) to help
  reviewers. No signup link (self-registration is not exposed, spec `03`).
- **Form fields:**

  | Field    | Input     | Validation (mirrors `loginSchema`, spec `03` §6.1) |
  |----------|-----------|-----------------------------------------------------|
  | email    | email     | required, valid email, normalized to lowercase |
  | password | password  | required, min 1; show/hide toggle |

- **Flow:** submit → disable button + spinner → on `200` store token per spec
  `11` storage decision (httpOnly cookie preferred, else in-memory + localStorage
  with the tradeoff documented), set auth context from `user`, redirect to
  `/dashboard`. On `401` show a single inline error "Invalid credentials" (no
  user enumeration — same message for wrong email or password). On `422` map
  field errors.
- **States:** submitting (button spinner), error (inline banner). No list states
  here.

### 3.2 Root — `Frontend/app/page.tsx`

- **Route:** `/`. Thin redirect: authenticated → `/dashboard`, else → `/login`.
  No UI beyond a brief loading placeholder while `GET /api/auth/me` resolves.

### 3.3 Dashboard shell — `Frontend/app/dashboard/layout.tsx`

- Replace the current flat nav (all links shown to everyone) with a **role-gated
  sidebar shell**: brand, primary nav filtered by spec `04`, a user menu
  (name, role badge, "Change password", "Log out" → `POST /api/auth/logout`
  then clear session), and the main content region.
- Guards: if no session, redirect to `/login`. Fetches `GET /api/auth/me` once
  and provides it via context to all pages.
- Nav item → required roles (hide if not permitted):

  | Nav item   | Visible to |
  |------------|-----------|
  | Overview   | all roles |
  | Orders     | owner, manager, chef, waiter, cashier |
  | Tables     | owner, manager, chef, waiter, cashier |
  | Menu       | owner, manager, chef, waiter, cashier |
  | Inventory  | owner, manager, store_manager |
  | Purchases  | owner, manager, store_manager |
  | Expenses   | owner, manager, store_manager, cashier (read) |
  | Invoices   | owner, manager, store_manager |
  | Suppliers  | owner, manager, store_manager |
  | Staff      | owner, manager |

---

## 4. Dashboard Overview

### 4.1 Overview — `Frontend/app/dashboard/page.tsx`

- **Route:** `/dashboard`. **Roles:** all authenticated (spec `04` §3, `§`
  note). Financial widgets (Profit, Monthly Expenses, Purchase Summary) may be
  hidden for kitchen/front roles (UX only) per the spec `04` default that all
  roles may read.
- **API (spec `10` dashboard endpoints):** one call per widget under
  `/api/dashboard/*` (e.g. `GET /api/dashboard/sales-overview`,
  `/active-orders`, `/table-occupancy`, `/low-stock`, `/monthly-expenses`,
  `/purchase-summary`, `/profit-overview`, `/supplier-summary`). If spec `10`
  exposes a single aggregate endpoint (`GET /api/dashboard`), consume that
  instead and slice client-side.
- **Layout:** `<PageHeader>` "Overview" + a date-range control where applicable.
  A responsive grid of `<StatCard>` and chart cards:

  | Widget          | Card type | Content |
  |-----------------|-----------|---------|
  | Sales Overview  | stat + line/bar chart | revenue over recent days, today's total |
  | Active Orders   | stat + mini list | count by status, quick links to Orders board |
  | Table Occupancy | stat + donut | occupied vs available vs reserved |
  | Low Stock Items | list | ingredients + products at/below reorder; link to Inventory |
  | Monthly Expenses| bar chart | last 6 months totals |
  | Purchase Summary| stat + list | POs by status, spend |
  | Profit Overview | stat | revenue − cost |
  | Supplier Summary| list | top suppliers by spend / invoice count |

- **States:** each widget owns its own loading skeleton / empty / error+retry so
  one failing widget does not blank the page. Empty widgets show a friendly
  "No data yet" and a link to the relevant module.
- **Density/responsive:** cards reflow 4→2→1 columns; charts stay legible on
  mobile with fewer ticks; numbers use tabular-nums.

---

## 5. Orders

### 5.1 Orders — `Frontend/app/dashboard/orders/page.tsx`

- **Route:** `/dashboard/orders`. **Roles (spec `04`):** owner/manager full;
  waiter create+read+update items; chef read + kitchen status only; cashier read
  + payment/checkout only. Buttons gate to these.
- **API:**

  | Action | Method + path |
  |--------|---------------|
  | List / board | `GET /api/orders?status=&order_type=&table_id=&search=&page=&sort=` |
  | Get one | `GET /api/orders/:id` (items included) |
  | Create | `POST /api/orders` (table/type + items) |
  | Update items/notes/discount | `PATCH /api/orders/:id` (waiter/manager) |
  | Kitchen status | `PATCH /api/orders/:id/status` (chef/manager) |
  | Payment/checkout | `PATCH /api/orders/:id/payment` (cashier/manager) |
  | Cancel | `DELETE /api/orders/:id` (owner/manager, non-terminal only) |

  (If spec `06` folds status/payment into `PATCH /api/orders/:id`, field-level
  RBAC in the service still restricts what each role may change; the UI sends
  only the fields that role owns.)

- **Layout:** two view modes toggled in the toolbar:
  - **Board (default, kitchen/operational):** columns per `order_status`
    (`open`, `sent_to_kitchen`, `preparing`, `ready`, `served`, `completed`;
    `cancelled` in a collapsed lane). Each card shows order number, table/type,
    item count, live total, elapsed time, payment badge. Cards are actionable:
    chef advances status along `sent_to_kitchen → preparing → ready`; cashier
    sees a "Checkout" affordance on `served`/`ready` paid-eligible orders.
  - **List:** dense `<DataTable>`.

  **List columns:** Order # · Table/Type · Status (badge) · Items · Subtotal ·
  Tax · Discount · Total · Payment (badge) · Waiter · Created · Actions.

- **Primary actions:** "New order" (waiter/manager). Filters: status, order_type,
  table, payment_status; search by order number.

- **Create order drawer/modal (waiter/manager):**
  - Step 1: pick `order_type` (`dine_in`/`takeaway`/`delivery`); if `dine_in`,
    pick a `table_id` from available tables (occupied tables warn).
  - Step 2: add menu items — searchable menu picker grouped by category, only
    `is_available` items selectable; set `quantity` and optional line `notes`.
  - Live totals panel: subtotal = Σ(quantity × unit_price), tax from
    `restaurant_profile.tax_rate`, discount input (manager), total. These are a
    **preview**; server recomputes on save (spec `01` §5.2 note).

  | Field (order) | Input | Validation (mirror spec `01`) |
  |---------------|-------|-------------------------------|
  | order_type    | select (enum) | required; default `dine_in` |
  | table_id      | select | required iff `dine_in`; must exist |
  | waiter_id     | derived from session (or select for manager) | optional FK |
  | discount      | number | ≥ 0 (manager only) |
  | notes         | textarea | optional |

  | Field (order_item) | Input | Validation |
  |--------------------|-------|------------|
  | menu_item_id | picker | required, must be available |
  | quantity     | number (int) | required, integer > 0 |
  | notes        | text  | optional |
  | item_name / unit_price | snapshot | set by server at order time (spec `01`) |

- **Key flows:**
  - *Create:* build items → preview total → `POST` → new card appears in `open`.
  - *Kitchen (chef):* advance status; only the allowed transitions are offered;
    a disallowed transition attempt surfaces the `403`/validation message.
  - *Cashier checkout:* open payment panel → pick `payment_method`
    (`cash/card/upi/bank_transfer/other`) → mark `payment_status = paid` →
    `PATCH …/payment`; on success the order can move to `completed`. Cashier
    cannot add/remove items (those controls are hidden and server-enforced).
  - *Cancel:* `ConfirmDialog`; only owner/manager, only non-terminal orders.

- **States:** board and list each show skeleton lanes/rows, an empty state
  ("No active orders — create one"), and error+retry. Optimistic status moves
  roll back on failure with a toast.

### 5.2 Order detail — `Frontend/app/dashboard/orders/[id]/page.tsx` (optional)

- A full-page ticket for print/large view. Same data as the drawer. Preferred
  UX is the drawer on the board; this route is a deep-link fallback and may be
  omitted if the drawer covers all needs.

---

## 6. Tables

### 6.1 Tables — `Frontend/app/dashboard/tables/page.tsx`

- **Route:** `/dashboard/tables`. **Roles (spec `04`):** owner/manager CRUD;
  waiter read + update (status); chef/cashier read. Store_manager: no access.
- **API:** `GET /api/tables` · `POST /api/tables` · `PATCH /api/tables/:id`
  (incl. status) · `DELETE /api/tables/:id` (owner/manager).
- **Layout:** a **grid of table cards** grouped by `section`, plus a compact
  admin list toggle. Each card: label, capacity, section, and a status color:

  | `table_status`   | Color |
  |------------------|-------|
  | available        | green |
  | occupied         | red/amber |
  | reserved         | blue |
  | out_of_service   | gray |

  A status legend sits in the toolbar. Occupied cards may link to the active
  order on that table.

- **Primary actions:** "Add table" (owner/manager). Filters: section, status.
- **Change status:** click a card → quick status menu (waiter+). For `dine_in`
  order flow, creating/closing an order can drive table status; manual override
  is allowed for permitted roles.
- **Create/edit modal:**

  | Field    | Input | Validation (spec `01` `restaurant_tables`) |
  |----------|-------|--------------------------------------------|
  | label    | text  | required, unique (`uq_restaurant_tables_label`) |
  | capacity | number(int) | required, > 0 |
  | section  | text  | optional |
  | status   | select (enum) | required; default `available` |

- **States:** grid skeleton cards, empty ("No tables yet — add your first"),
  error+retry. Unique-label `409` surfaces on the `label` field.
- **Responsive:** grid 6→3→2 columns; cards stay tappable; legend wraps.

---

## 7. Menu (with Categories and Recipes tabs)

Parent layout `Frontend/app/dashboard/menu/layout.tsx` renders `<Tabs>`:
**Items** (default) · **Categories** · **Recipes**.

### 7.1 Menu Items — `Frontend/app/dashboard/menu/page.tsx`

- **Route:** `/dashboard/menu`. **Roles (spec `04`):** owner/manager CRUD; chef
  RU limited to availability (and prep/recipe-facing fields, not `price`);
  waiter/cashier read.
- **API:** `GET /api/menu-items?category_id=&is_available=&search=` ·
  `POST /api/menu-items` · `PATCH /api/menu-items/:id` (incl. availability
  toggle) · `DELETE /api/menu-items/:id` (deactivate, owner/manager).
- **Layout:** dense `<DataTable>` (or grouped-by-category sections).
  **Columns:** Name · Category · Price · Cost · Prep (min) · Available (toggle) ·
  Actions. Toolbar: search, category filter, availability filter, "Add item".
- **Availability toggle:** inline switch → `PATCH …/:id { is_available }`.
  Chef sees the toggle enabled but `price`/`cost` inputs disabled/hidden.
- **Create/edit drawer:**

  | Field | Input | Validation (spec `01` `menu_items`) |
  |-------|-------|-------------------------------------|
  | category_id | select | required, FK → menu_categories |
  | name | text | required; unique per category (`uq_menu_items_category_name`) |
  | description | textarea | optional |
  | price | number(money) | required, ≥ 0 (owner/manager only) |
  | cost | number(money) | optional, ≥ 0 |
  | prep_time_minutes | number(int) | optional, ≥ 0 |
  | is_available | toggle | default true |
  | image_url | text/url | optional |

- **States:** skeleton rows, empty ("No menu items — add one"), error+retry.
  Duplicate-name `409` maps to the name field.

### 7.2 Menu Categories — tab within `/dashboard/menu` (Categories tab)

- Rendered in the same page or a `categories` segment. **Roles:** owner/manager
  CRUD; others read.
- **API:** `GET/POST /api/menu-categories`, `PATCH/DELETE /api/menu-categories/:id`
  (deactivate).
- **Layout:** small sortable list. **Columns:** Name · Description · Sort order ·
  Active (toggle) · Actions.
- **Create/edit modal:**

  | Field | Input | Validation |
  |-------|-------|-----------|
  | name | text | required, unique (`uq_menu_categories_name`) |
  | description | textarea | optional |
  | sort_order | number(int) | default 0 |
  | is_active | toggle | default true |

### 7.3 Recipes — `Frontend/app/dashboard/menu/recipes/page.tsx`

- **Route:** `/dashboard/menu/recipes`. **Roles (spec `04`):** owner/manager/chef
  CRUD; waiter read; cashier none.
- **API:**

  | Action | Method + path |
  |--------|---------------|
  | List recipes | `GET /api/recipes` (join menu_item name) |
  | Get one | `GET /api/recipes/:id` (with `recipe_ingredients`) |
  | Create | `POST /api/recipes` (menu_item_id + ingredient lines) |
  | Update | `PATCH /api/recipes/:id` |
  | Delete | `DELETE /api/recipes/:id` |

- **Layout:** left list of menu items (with/without a recipe indicated); right
  editor for the selected recipe. **List columns:** Menu item · Yield · #
  ingredients · Actions.
- **Recipe editor (drawer or right pane):**

  | Field (recipe) | Input | Validation (spec `01` `recipes`) |
  |----------------|-------|----------------------------------|
  | menu_item_id | select | required, unique (one recipe per item) |
  | yield_servings | number(int) | required, > 0, default 1 |
  | prep_time_minutes | number(int) | optional |
  | instructions | textarea | optional |

  **Recipe ingredients** — an editable line-item table (add/remove rows):

  | Field (recipe_ingredient) | Input | Validation (`recipe_ingredients`) |
  |---------------------------|-------|-----------------------------------|
  | ingredient_id | select (from ingredients) | required; unique per recipe (`uq_recipe_ingredients_recipe_ingredient`) |
  | quantity | number(qty) | required, > 0 |
  | unit | select (measurement_unit) | required |

- **Key flow:** pick a menu item without a recipe → add ingredient rows with
  qty+unit → save. Duplicate ingredient in one recipe → `409`/validation mapped
  to that row. Optional derived cost preview (Σ quantity × ingredient
  `cost_per_unit`) shown read-only.
- **States:** list skeleton, empty ("No recipes yet"), error+retry; editor shows
  its own loading when fetching a recipe's lines.

---

## 8. Inventory (Products / Ingredients / Warehouses / Movements / Categories tabs)

Parent layout `Frontend/app/dashboard/inventory/layout.tsx` renders `<Tabs>`:
**Products** (default) · **Ingredients** · **Warehouses** · **Movements** ·
**Categories**. All inventory tabs are **owner / manager / store_manager** only
(spec `04`); ingredients additionally allow chef `RU`.

### 8.1 Products — `Frontend/app/dashboard/inventory/page.tsx`

- **Route:** `/dashboard/inventory`. **API:**
  `GET /api/products?category_id=&supplier_id=&warehouse_id=&low_stock=&search=` ·
  `POST /api/products` · `PATCH /api/products/:id` · `DELETE /api/products/:id`
  (deactivate). Stock actions: `POST /api/stock-movements` (see §8.4).
- **Layout:** dense `<DataTable>`. **Columns:** SKU · Name · Category · Unit ·
  Current stock · Reorder level · Cost price · Supplier · Warehouse · Actions
  (Edit · **Stock in** · **Stock out**). Rows at/below reorder are highlighted
  (amber row + a "Low" badge). Toolbar: search, category/supplier/warehouse
  filters, a "Low stock only" toggle, "Add product".
- **Create/edit drawer:**

  | Field | Input | Validation (spec `01` `products`) |
  |-------|-------|-----------------------------------|
  | sku | text | required, unique (`uq_products_sku`) |
  | name | text | required |
  | category_id | select | optional, FK → product_categories |
  | unit | select (measurement_unit) | required |
  | current_stock | number(qty) | ≥ 0 (usually set via movements, not edited directly) |
  | reorder_level | number(qty) | ≥ 0 |
  | cost_price | number(money) | ≥ 0 |
  | supplier_id | select | optional |
  | warehouse_id | select | optional (home warehouse) |
  | is_active | toggle | default true |

- **Stock in/out actions** open the movement modal (§8.4) prefilled with the
  product; on success the row's `current_stock` refreshes and low-stock
  highlighting recomputes.
- **States:** skeleton rows, empty ("No products — add one"), error+retry.

### 8.2 Ingredients — `Frontend/app/dashboard/inventory/ingredients/page.tsx`

- **Route:** `/dashboard/inventory/ingredients`. **Roles:** owner/manager/
  store_manager CRUD; chef `RU`.
- **API:** `GET /api/ingredients?supplier_id=&low_stock=&search=` ·
  `POST /api/ingredients` · `PATCH /api/ingredients/:id` ·
  `DELETE /api/ingredients/:id` (deactivate).
- **Layout:** dense table. **Columns:** Name · Unit · Current stock · Reorder
  level · Cost/unit · Supplier · Active · Actions. Low-stock rows highlighted
  (`current_stock <= reorder_level`, spec `01`). Ingredients are **not**
  per-warehouse in Phase 1 — no warehouse column, stock adjusted directly.
- **Create/edit drawer:**

  | Field | Input | Validation (spec `01` `ingredients`) |
  |-------|-------|--------------------------------------|
  | name | text | required, unique (`uq_ingredients_name`) |
  | unit | select (measurement_unit) | required |
  | current_stock | number(qty) | ≥ 0 |
  | reorder_level | number(qty) | ≥ 0 |
  | cost_per_unit | number(money) | ≥ 0 |
  | supplier_id | select | optional |
  | is_active | toggle | default true |

- Chef sees read + a limited edit (e.g. `current_stock` adjustment/availability)
  per spec `04`; create/delete hidden for chef.
- **States:** skeleton/empty/error+retry.

### 8.3 Warehouses — `Frontend/app/dashboard/inventory/warehouses/page.tsx`

- **Route:** `/dashboard/inventory/warehouses`. **Roles:** owner/manager/
  store_manager CRUD.
- **API:** `GET/POST /api/warehouses`, `PATCH/DELETE /api/warehouses/:id`
  (deactivate).
- **Layout:** list/grid. **Columns:** Name · Location · Type · Active · Actions.
- **Create/edit modal:**

  | Field | Input | Validation (spec `01` `warehouses`) |
  |-------|-------|-------------------------------------|
  | name | text | required, unique (`uq_warehouses_name`) |
  | location | text | optional |
  | type | select/text | required, default `store` (e.g. store/kitchen) |
  | is_active | toggle | default true |

- **States:** skeleton/empty/error+retry.

### 8.4 Stock Movements (ledger) — `Frontend/app/dashboard/inventory/movements/page.tsx`

- **Route:** `/dashboard/inventory/movements`. **Roles:** owner/manager/
  store_manager.
- **API:** `GET /api/stock-movements?product_id=&warehouse_id=&movement_type=&from=&to=` ·
  `POST /api/stock-movements` (creates the movement and, in one transaction,
  updates `products.current_stock`, spec `01` §5.3 / spec `07`).
- **Layout:** dense read-mostly ledger. **Columns:** Date · Product · Warehouse ·
  Type (badge) · Quantity (signed by direction) · Unit cost · Reference · Reason
  · Created by. Toolbar: filters (product, warehouse, type, date range),
  "New movement".
- **New movement modal (also reachable from Products stock in/out):**

  | Field | Input | Validation (spec `01` `stock_movements`) |
  |-------|-------|------------------------------------------|
  | product_id | select | required |
  | warehouse_id | select | required |
  | movement_type | select (enum) | required (`stock_in`/`stock_out`/`adjustment`/`wastage`/`transfer`) |
  | quantity | number(qty) | required, > 0 (always positive; direction from type) |
  | unit_cost | number(money) | optional, ≥ 0 |
  | reference | text | optional (PO#, order id) |
  | reason | text | optional (recommended for `adjustment`/`wastage`) |

- **Key flow:** submit → server applies the signed delta to product stock in a
  transaction → ledger prepends the new row and the affected product's stock and
  low-stock highlight update. Attempting to drive stock negative surfaces the
  server validation error.
- **States:** skeleton/empty/error+retry.

### 8.5 Product Categories — `Frontend/app/dashboard/inventory/categories/page.tsx`

- **Route:** `/dashboard/inventory/categories`. **Roles:** owner/manager/
  store_manager CRUD.
- **API:** `GET/POST /api/product-categories`,
  `PATCH/DELETE /api/product-categories/:id` (deactivate).
- **Layout:** small list. **Columns:** Name · Description · Active · Actions.
- **Create/edit modal:**

  | Field | Input | Validation (spec `01` `product_categories`) |
  |-------|-------|---------------------------------------------|
  | name | text | required, unique (`uq_product_categories_name`) |
  | description | textarea | optional |
  | is_active | toggle | default true |

---

## 9. Suppliers

### 9.1 Suppliers — `Frontend/app/dashboard/suppliers/page.tsx`

- **Route:** `/dashboard/suppliers`. **Roles (spec `04`):** owner/manager/
  store_manager CRUD.
- **API:** `GET /api/suppliers?search=&is_active=` · `POST /api/suppliers` ·
  `PATCH /api/suppliers/:id` · `DELETE /api/suppliers/:id` (deactivate).
- **Layout:** dense `<DataTable>`. **Columns:** Name · Contact · Email · Phone ·
  Payment terms · Active · Actions. Toolbar: search, active filter, "Add
  supplier". Optional row expansion showing linked products/POs/invoices counts.
- **Create/edit drawer:**

  | Field | Input | Validation (spec `01` `suppliers`) |
  |-------|-------|------------------------------------|
  | name | text | required, unique (`uq_suppliers_name`) |
  | contact_name | text | optional |
  | email | email | optional, valid email |
  | phone | text | optional |
  | address | textarea | optional |
  | payment_terms | text | optional (e.g. "Net 30") |
  | is_active | toggle | default true |

- **States:** skeleton rows, empty ("No suppliers yet"), error+retry.
  Deactivate instead of hard delete (referenced by products/POs/invoices,
  spec `01` §1.4); a delete blocked by FK surfaces a friendly `409`.

---

## 10. Staff / Users

### 10.1 Staff — `Frontend/app/dashboard/staff/page.tsx`

- **Route:** `/dashboard/staff`. **Roles (spec `04`):** owner CRUD; manager CRUD
  except owner accounts (and not self-deactivate). Others: no access (nav
  hidden).
- **API:**

  | Action | Method + path |
  |--------|---------------|
  | List | `GET /api/users?role=&is_active=&search=` |
  | Create | `POST /api/users` |
  | Update | `PATCH /api/users/:id` |
  | Activate/deactivate | `PATCH /api/users/:id` (`is_active`) or `DELETE /api/users/:id` (deactivate) |
  | Admin reset password | `POST /api/users/:id/reset-password` (spec `09`) |

  `password_hash` is never returned (spec `03`).

- **Layout:** dense `<DataTable>`. **Columns:** Name · Email · Role (badge) ·
  Phone · Active · Last login · Actions (Edit · Activate/Deactivate · Reset
  password). Toolbar: search, role filter, active filter, "Add staff".
- **Create/edit drawer:**

  | Field | Input | Validation (spec `01` `users`, spec `09`) |
  |-------|-------|-------------------------------------------|
  | full_name | text | required |
  | email | email | required, unique (`uq_users_email`), lowercased |
  | role | select (user_role) | required; **manager cannot select `owner`** (option hidden/disabled); non-owner cannot elevate to owner (spec `04` §4) |
  | phone | text | optional |
  | password | password | required on create (min 8, spec `03` change-pw rule); omitted on edit |
  | is_active | toggle | default true; manager cannot toggle **own** account |

- **Ownership rules enforced in UX (server also enforces, spec `04` §5):**
  - Manager rows for owner accounts: edit/deactivate/reset disabled.
  - The current user's own row: no self-deactivate/delete.
  - Reset password: owner/manager only; managers cannot target an owner.
- **Key flows:**
  - *Create staff:* fill form incl. initial password → `POST` → appears in list.
  - *Deactivate:* `ConfirmDialog` → `is_active=false`; row greys out; user can no
    longer log in (spec `03` returns 401 for deactivated).
  - *Reset password:* modal with a new password (min 8) → `POST …/reset-password`;
    a `403` (e.g. manager targeting owner) surfaces as a toast.
- **States:** skeleton rows, empty (unlikely — seed has staff; still handle),
  error+retry. Duplicate email `409` maps to the email field.

---

## 11. Purchases (Purchase Orders)

### 11.1 Purchase Orders — `Frontend/app/dashboard/purchases/page.tsx`

- **Route:** `/dashboard/purchases`. **Roles (spec `04`):** owner/manager/
  store_manager CRUD.
- **API:**

  | Action | Method + path |
  |--------|---------------|
  | List | `GET /api/purchase-orders?status=&supplier_id=&warehouse_id=&search=` |
  | Get one | `GET /api/purchase-orders/:id` (with items) |
  | Create | `POST /api/purchase-orders` (header + line items) |
  | Update (draft) | `PATCH /api/purchase-orders/:id` |
  | Receive | `POST /api/purchase-orders/:id/receive` (full or partial) |
  | Cancel | `DELETE /api/purchase-orders/:id` (draft/ordered only) |

- **Layout:** dense `<DataTable>`. **Columns:** PO # · Supplier · Warehouse ·
  Status (badge) · Order date · Expected · Subtotal · Tax · Total · Actions
  (View · **Receive** when `ordered`/`partially_received` · Cancel when
  draft/ordered). Toolbar: status filter, supplier/warehouse filter, search,
  "New PO". Status badge colors:

  | `purchase_order_status` | Color |
  |-------------------------|-------|
  | draft | gray |
  | ordered | blue |
  | partially_received | amber |
  | received | green |
  | cancelled | red |

- **Create PO drawer/detail:**
  - Header fields:

    | Field | Input | Validation (spec `01` `purchase_orders`) |
    |-------|-------|------------------------------------------|
    | supplier_id | select | required, FK |
    | warehouse_id | select | required, FK |
    | order_date | date | optional |
    | expected_date | date | optional |
    | notes | textarea | optional |
    | status | select | default `draft` (create as draft; move to `ordered`) |

  - Line items (add/remove rows):

    | Field (po_item) | Input | Validation (`purchase_order_items`) |
    |-----------------|-------|-------------------------------------|
    | product_id | select | required, FK |
    | quantity_ordered | number(qty) | required, > 0 |
    | unit_cost | number(money) | required, ≥ 0 |
    | line_total | derived | quantity_ordered × unit_cost (server authoritative) |

  - Totals preview: subtotal = Σ line_total, tax, total. Server recomputes.

- **Receive flow (RECEIVE action):** opens a receive modal listing each line
  with `quantity_ordered`, already `quantity_received`, and an input for the
  quantity received now (≤ remaining). Submitting `POST …/receive`:
  - increments `quantity_received`,
  - creates `stock_in` `stock_movements` into the PO's warehouse,
  - updates `products.current_stock`,
  - transitions status to `partially_received` or `received`,
  all in one backend transaction (spec `01` §5.3, spec `07`). On success the PO
  row status/badge updates and product stocks reflect the receipt.
- **States:** skeleton rows, empty ("No purchase orders — create one"),
  error+retry. Cancel guarded by state (only draft/ordered) and `ConfirmDialog`.

### 11.2 PO detail — `Frontend/app/dashboard/purchases/[id]/page.tsx` (optional)

- Full-page PO view with header, line items, receive history (movements
  referencing this PO), and the Receive action. May be a drawer instead; keep
  one canonical implementation.

---

## 12. Expenses (Records / Monthly / Categories tabs)

Parent layout `Frontend/app/dashboard/expenses/layout.tsx` renders `<Tabs>`:
**Records** (default) · **Monthly** · **Categories**.

### 12.1 Expense Records — `Frontend/app/dashboard/expenses/page.tsx`

- **Route:** `/dashboard/expenses`. **Roles (spec `04`):** owner/manager/
  store_manager CRUD; cashier read-only.
- **API:** `GET /api/expense-records?category_id=&supplier_id=&from=&to=&search=` ·
  `POST /api/expense-records` · `PATCH /api/expense-records/:id` ·
  `DELETE /api/expense-records/:id`.
- **Layout:** dense `<DataTable>`. **Columns:** Date · Category · Description ·
  Supplier · Amount · Payment method · Reference · Created by · Actions. Toolbar:
  date-range, category/supplier filters, search, "Add expense". A summary strip
  shows the filtered total. Cashier sees no create/edit/delete controls.
- **Create/edit drawer:**

  | Field | Input | Validation (spec `01` `expense_records`) |
  |-------|-------|------------------------------------------|
  | category_id | select | required, FK → expense_categories |
  | description | text | required |
  | amount | number(money) | required, ≥ 0 |
  | expense_date | date | required |
  | supplier_id | select | optional |
  | invoice_id | select | optional (link to a supplier invoice) |
  | payment_method | select (enum) | optional |
  | reference | text | optional |

- **States:** skeleton rows, empty ("No expenses recorded"), error+retry.

### 12.2 Monthly Expense Tracking — `Frontend/app/dashboard/expenses/monthly/page.tsx`

- **Route:** `/dashboard/expenses/monthly`. **Roles:** owner/manager/
  store_manager/cashier read (spec `04`).
- **API:** `GET /api/expenses/monthly` (backed by `monthly_expense_summary` view,
  spec `01` §5.5 / spec `08`/`10`) → months × category totals.
- **Layout:** a bar/line chart of the **last 6 months** total spend, plus a
  breakdown table (Month · Category · Records · Total) and a month-over-month
  delta. Category filter and range selector in the toolbar. No create controls
  (this is an aggregation view).
- **States:** chart skeleton, empty ("No expense history yet"), error+retry.

### 12.3 Expense Categories — `Frontend/app/dashboard/expenses/categories/page.tsx`

- **Route:** `/dashboard/expenses/categories`. **Roles (spec `04`):** owner/
  manager CRUD; store_manager `RU` (create/delete hidden for store_manager).
- **API:** `GET/POST /api/expense-categories`,
  `PATCH/DELETE /api/expense-categories/:id` (deactivate).
- **Layout:** small list. **Columns:** Name · Description · Active · Actions.
- **Create/edit modal:**

  | Field | Input | Validation (spec `01` `expense_categories`) |
  |-------|-------|---------------------------------------------|
  | name | text | required, unique (`uq_expense_categories_name`) |
  | description | textarea | optional |
  | is_active | toggle | default true |

---

## 13. Invoices (Supplier Invoices) + Upload & Review

### 13.1 Invoice list — `Frontend/app/dashboard/invoices/page.tsx`

- **Route:** `/dashboard/invoices`. **Roles (spec `04`):** owner/manager/
  store_manager CRUD.
- **API:** `GET /api/supplier-invoices?supplier_id=&status=&from=&to=&search=` ·
  `GET /api/supplier-invoices/:id` (with items) · `POST /api/supplier-invoices`
  (may be multipart with the file) · `PATCH /api/supplier-invoices/:id` ·
  `DELETE /api/supplier-invoices/:id`. File upload endpoint per spec `08`
  (`POST /api/supplier-invoices/:id/file` or multipart on create, via
  `upload.middleware`).
- **Layout:** dense `<DataTable>`. **Columns:** Invoice # · Supplier · Invoice
  date · Due date · Subtotal · Tax · Total · Status (badge) · File (paperclip if
  attached) · Actions (View/Review · Edit · Delete). Toolbar: supplier/status
  filters, date-range, search, **"New invoice"** (→ `/dashboard/invoices/new`).
  Status badge colors:

  | `invoice_status` | Color |
  |------------------|-------|
  | pending | gray |
  | verified | blue |
  | paid | green |
  | disputed | red |

- **States:** skeleton rows, empty ("No invoices — add one"), error+retry.

### 13.2 Invoice upload & new — `Frontend/app/dashboard/invoices/new/page.tsx`

- **Route:** `/dashboard/invoices/new`. Same roles as list. This is the
  **"Invoice upload & review"** screen. Phase 1 is **manual entry with an
  attached file**; AI/OCR auto-extract is Phase 2 (out of scope here, spec `00`
  §2).
- **Layout — split screen:**
  - **Left: file panel.** A dropzone accepting **PDF and image** (jpg/png).
    After selection, render an inline preview (PDF viewer / image). The file is
    uploaded to Express (which stores it on disk under `Backend/src/uploads/`
    and persists only `file_url`, spec `01` `supplier_invoices.file_url`). Above
    or beside the preview, a clearly labeled, visually distinct **placeholder
    region**: *"Auto-extract with AI — coming in Phase 2"* (disabled "Extract"
    button + helper text). This is where OCR autofill will populate the form
    later; in Phase 1 it does nothing and must not block manual entry.
  - **Right: manual entry form** (header + line items).

  **Header fields:**

  | Field | Input | Validation (spec `01` `supplier_invoices`) |
  |-------|-------|--------------------------------------------|
  | supplier_id | select | required, FK |
  | invoice_number | text | required; unique per supplier (`uq_supplier_invoices_supplier_number`) |
  | invoice_date | date | optional |
  | due_date | date | optional |
  | status | select (invoice_status) | default `pending` |
  | notes | textarea | optional |
  | file | file (pdf/image) | optional; type + size validated client-side, re-checked server-side |

  **Line items (add/remove rows):**

  | Field (invoice_item) | Input | Validation (`supplier_invoice_items`) |
  |----------------------|-------|---------------------------------------|
  | product_id | select | optional, FK → products |
  | description | text | required |
  | quantity | number(qty) | required, > 0 |
  | unit_price | number(money) | required, ≥ 0 |
  | line_total | derived | quantity × unit_price (server authoritative) |

  **Totals preview:** subtotal = Σ line_total, tax input, total. Server
  recomputes and returns authoritative values.

- **Key flow:** attach file (optional) → fill header + at least one line →
  preview totals → `POST` (multipart if a file is attached) → on success
  redirect to `/dashboard/invoices/[id]` (review) or back to the list.
  `ocr_raw` stays null in Phase 1 (spec `01`).
- **States:** the file preview has its own loading/error (bad file type →
  inline message); the form has field-level `422` mapping and a submit
  pending/error state.

### 13.3 Invoice review / edit — `Frontend/app/dashboard/invoices/[id]/page.tsx`

- **Route:** `/dashboard/invoices/:id`. Same roles. Shows the same split layout:
  the stored file preview on the left (link/download if present, or an empty
  slot), the editable invoice header + line items on the right, and the same
  disabled Phase-2 OCR placeholder. Status can be advanced
  (`pending → verified → paid`, or `disputed`) via a status control that
  `PATCH`es the invoice. An optional "Record as expense" action pre-fills the
  Expense form linking `invoice_id` (spec `01` `expense_records.invoice_id`).
- **States:** loading skeleton for header + items + file, empty/not-found
  (`404` → "Invoice not found" with back link), error+retry.

---

## 14. Route → module → roles → components summary

| Route | File | Backend module(s) / endpoints | Allowed roles (UX gate; server-enforced) | Primary components |
|-------|------|-------------------------------|------------------------------------------|--------------------|
| `/login` | `app/login/page.tsx` | `auth` (`POST /auth/login`, `GET /auth/me`) | public | Card, `<FormField>`, inline error |
| `/` | `app/page.tsx` | `auth` (`/auth/me`) | any | redirect + loader |
| `/dashboard` (shell) | `app/dashboard/layout.tsx` | `auth` (`/auth/me`, `/auth/logout`) | all authenticated | Sidebar, user menu, `<StatusBadge>` |
| `/dashboard` | `app/dashboard/page.tsx` | `dashboard` (`/dashboard/*`, spec 10) | all (financial widgets may hide) | `<StatCard>`, charts, `<EmptyState>` |
| `/dashboard/orders` | `app/dashboard/orders/page.tsx` | `orders` (`/orders`, `/orders/:id`, `/status`, `/payment`) | owner, manager, chef, waiter, cashier | Board, `<DataTable>`, `<Drawer>`, menu picker |
| `/dashboard/orders/:id` | `app/dashboard/orders/[id]/page.tsx` (opt) | `orders` | owner, manager, chef, waiter, cashier | ticket view |
| `/dashboard/tables` | `app/dashboard/tables/page.tsx` | `tables` (`/tables`) | owner, manager, waiter(RU), chef(R), cashier(R) | status grid, `<Modal>`, legend |
| `/dashboard/menu` | `app/dashboard/menu/page.tsx` | `menu-items`, `menu-categories` | owner, manager, chef(RU), waiter(R), cashier(R) | `<Tabs>`, `<DataTable>`, availability toggle, `<Drawer>` |
| `/dashboard/menu/recipes` | `app/dashboard/menu/recipes/page.tsx` | `recipes`, `recipe-ingredients`, `ingredients` | owner, manager, chef; waiter(R) | list + editor, line-item table |
| `/dashboard/inventory` | `app/dashboard/inventory/page.tsx` | `products`, `stock-movements` | owner, manager, store_manager | `<Tabs>`, `<DataTable>`, stock modal, low-stock highlight |
| `/dashboard/inventory/ingredients` | `app/dashboard/inventory/ingredients/page.tsx` | `ingredients` | owner, manager, store_manager; chef(RU) | `<DataTable>`, `<Drawer>`, low-stock highlight |
| `/dashboard/inventory/warehouses` | `app/dashboard/inventory/warehouses/page.tsx` | `warehouses` | owner, manager, store_manager | list/grid, `<Modal>` |
| `/dashboard/inventory/movements` | `app/dashboard/inventory/movements/page.tsx` | `stock-movements`, `products`, `warehouses` | owner, manager, store_manager | ledger `<DataTable>`, movement `<Modal>` |
| `/dashboard/inventory/categories` | `app/dashboard/inventory/categories/page.tsx` | `product-categories` | owner, manager, store_manager | list, `<Modal>` |
| `/dashboard/purchases` | `app/dashboard/purchases/page.tsx` | `purchase-orders`, `purchase-order-items`, `stock-movements` | owner, manager, store_manager | `<DataTable>`, PO `<Drawer>`, receive `<Modal>` |
| `/dashboard/purchases/:id` | `app/dashboard/purchases/[id]/page.tsx` (opt) | `purchase-orders` | owner, manager, store_manager | PO detail, receive |
| `/dashboard/expenses` | `app/dashboard/expenses/page.tsx` | `expense-records` | owner, manager, store_manager; cashier(R) | `<Tabs>`, `<DataTable>`, `<Drawer>`, total strip |
| `/dashboard/expenses/monthly` | `app/dashboard/expenses/monthly/page.tsx` | `monthly_expense_summary` (`/expenses/monthly`) | owner, manager, store_manager, cashier(R) | chart, breakdown table |
| `/dashboard/expenses/categories` | `app/dashboard/expenses/categories/page.tsx` | `expense-categories` | owner, manager; store_manager(RU) | list, `<Modal>` |
| `/dashboard/invoices` | `app/dashboard/invoices/page.tsx` | `supplier-invoices` | owner, manager, store_manager | `<DataTable>`, `<StatusBadge>`, file icon |
| `/dashboard/invoices/new` | `app/dashboard/invoices/new/page.tsx` | `supplier-invoices` (+ file upload) | owner, manager, store_manager | split view, dropzone/preview, line-item form, OCR placeholder |
| `/dashboard/invoices/:id` | `app/dashboard/invoices/[id]/page.tsx` | `supplier-invoices` | owner, manager, store_manager | split view, status control, file preview, OCR placeholder |
| `/dashboard/suppliers` | `app/dashboard/suppliers/page.tsx` | `suppliers` | owner, manager, store_manager | `<DataTable>`, `<Drawer>` |
| `/dashboard/staff` | `app/dashboard/staff/page.tsx` | `users` (staff) | owner, manager (not on owner accts) | `<DataTable>`, `<Drawer>`, reset-pw `<Modal>`, `<ConfirmDialog>` |

## 15. Acceptance for this spec

- [ ] Every route above exists as a real page (no "pending"/placeholder response
      a reviewer can click into — DoD gate, spec `00` §10).
- [ ] Sidebar nav is role-gated per §3.3 / spec `04`; hidden items and disabled
      actions match the matrix, and unexpected `403`s are surfaced gracefully.
- [ ] Every data view implements loading (skeleton), empty (with CTA), and
      error (retry) states (AGENTS.md; spec `00` §10).
- [ ] Recipes, Ingredients, Warehouses, Stock Movements, Product Categories,
      Expense Categories, and Monthly Tracking are reachable as tabs/sub-routes
      per §1.2, each with its own URL and data fetch.
- [ ] Orders support create (table/type + items + live total preview), kitchen
      status transitions (chef), and cashier payment/checkout, with field-level
      controls hidden per role.
- [ ] Tables render as a status-colored grid with status change.
- [ ] Menu availability toggle, Recipes ingredient editor, Inventory stock
      in/out (creating movements + low-stock highlight), Purchases create +
      RECEIVE, Expenses records + monthly chart + categories, and Staff
      create/edit/(de)activate/reset-password (respecting ownership rules) all
      work against real endpoints.
- [ ] Invoices support list + create/edit with line items + file upload (PDF/
      image) + a review screen showing the uploaded file and a manual form, with
      a clearly marked disabled placeholder region reserved for Phase 2 OCR.
- [ ] Form fields and validation mirror spec `01` columns and the backend Zod
      rules; `422` field errors map back onto inputs.
- [ ] Money/quantities use `restaurant_profile` currency and measurement units;
      totals shown on create forms are previews and the server value wins.
- [ ] Layout is dense and responsive per AGENTS.md; no marketing hero; text fits
      on desktop and mobile.
