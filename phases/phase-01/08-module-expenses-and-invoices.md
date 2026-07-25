# Phase 1 — Spec 08: Expenses & Invoices Modules

> Backend CRUD for Expense Categories, Expense Records, Supplier Invoices (with
> line items and file-upload metadata), and Monthly Expense Tracking. Depends on
> spec `01` (table/column names used verbatim), spec `04` (permission matrix,
> repeated per endpoint below and authoritative), and spec `05` (module anatomy,
> Zod validation, error handling, response envelope, pagination, `withTransaction`).
> **Phase 1 boundary:** Supplier Invoices are **manual CRUD only** — create, list,
> edit, delete, line-item management, and file upload storing `file_url`. The
> AI/OCR invoice extraction and the Excel expense register are **Phase 2**; the
> `supplier_invoices.ocr_raw` jsonb column stays **null** in Phase 1.

## 1. Scope & modules

This spec owns four related areas, all under the supply-chain / finance side of
RestaurantOS:

| Area                     | Tables owned                                             | Delete model                       |
|--------------------------|---------------------------------------------------------|------------------------------------|
| Expense Categories       | `expense_categories`                                    | soft delete (`is_active`)          |
| Expense Records          | `expense_records`                                       | hard delete (owner/manager)        |
| Supplier Invoices        | `supplier_invoices` + `supplier_invoice_items`          | hard delete (owner/manager)        |
| Monthly Expense Tracking | read-only view over `expense_records` (`monthly_expense_summary`, spec `01` §5.5) | n/a (read only) |

All conventions from spec `05` apply: routes under `/api`, `{ data, meta }`
success envelope, `{ message, errors }` error envelope, Zod validation per write,
`asyncHandler`, `ApiError`, `requireRole` with owner-bypass, parameterized SQL,
`withTransaction` for multi-statement writes. Money/quantity numerics are cast to
numbers in the service mapper (spec `05` §6). SQL returns snake_case and the API
returns snake_case (no camelCase transform).

Module directories (spec `05` §1):

```
Backend/src/modules/expense-categories/
Backend/src/modules/expense-records/
Backend/src/modules/supplier-invoices/
Backend/src/modules/expenses/            # monthly tracking (read-only aggregation)
```

`Backend/src/routes.js` mounts each module's `mount*Routes(parentRouter)`.

---

## 2. Expense Categories module

### 2.1 Purpose

Reference/config list of expense buckets (e.g. `Rent`, `Utilities`, `Salaries`,
`Supplies`) that every `expense_records` row must reference. Because other rows
point to it, it is **soft-deleted** via `is_active` (spec `01` §1.4), never hard
deleted.

### 2.2 Table & columns owned (`expense_categories`, spec `01` §5.4)

| Column      | Type            | Notes                                             |
|-------------|-----------------|---------------------------------------------------|
| id          | bigint identity | PK                                                |
| name        | text            | NOT NULL, UNIQUE (`uq_expense_categories_name`)   |
| description | text            | NULL                                              |
| is_active   | boolean         | NOT NULL DEFAULT true                             |
| created_at  | timestamptz     | NOT NULL DEFAULT now()                            |
| updated_at  | timestamptz     | NOT NULL DEFAULT now() (via `set_updated_at`)     |

### 2.3 Endpoints

Roles copied from spec `04` matrix, row **Expense categories** (`owner CRUD`,
`manager CRUD`, `store_manager RU`). `owner` is omitted from the lists below
because of the owner-bypass in `requireRole` (spec `04` §2.1).

| Method | Path                          | Description                          | Allowed roles                | Success |
|--------|-------------------------------|--------------------------------------|------------------------------|---------|
| GET    | `/api/expense-categories`     | List expense categories (paginated)  | manager, store_manager       | 200     |
| GET    | `/api/expense-categories/:id` | Get one category                     | manager, store_manager       | 200     |
| POST   | `/api/expense-categories`     | Create a category                    | manager                      | 201     |
| PATCH  | `/api/expense-categories/:id` | Update name/description/is_active     | manager, store_manager       | 200     |
| DELETE | `/api/expense-categories/:id` | Deactivate (soft delete)             | manager                      | 200     |

> Matrix note: `store_manager` has **RU** only — no create, no delete. Create and
> delete require `manager` (or `owner` via bypass). Update is allowed for
> `store_manager`.

### 2.4 List query params

| Param      | Type   | Rule                                                              |
|------------|--------|------------------------------------------------------------------|
| `page`     | number | `z.coerce.number().int().min(1)`, default 1                       |
| `limit`    | number | `z.coerce.number().int().min(1).max(100)`, default 20            |
| `sort`     | string | whitelist: `name`, `created_at`, `updated_at`; `-` prefix = desc; default `name` |
| `search`   | string | optional; `ILIKE '%'||$1||'%'` on `name`                          |
| `is_active`| boolean| optional; `z.coerce.boolean()`; filter by active flag            |

### 2.5 Body shapes (Zod)

```js
// createSchema (.strict())
{
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  is_active: z.boolean().optional().default(true),
}

// updateSchema = createSchema.partial().strict()  (at least one key required)
```

### 2.6 Example create request/response

Request `POST /api/expense-categories`:

```json
{ "name": "Utilities", "description": "Electricity, water, gas" }
```

Response `201 Created`:

```json
{
  "data": {
    "id": 7,
    "name": "Utilities",
    "description": "Electricity, water, gas",
    "is_active": true,
    "created_at": "2026-07-25T09:12:00.000Z",
    "updated_at": "2026-07-25T09:12:00.000Z"
  }
}
```

### 2.7 Business rules & edge cases

- `name` is unique (`uq_expense_categories_name`). Duplicate insert → Postgres
  `23505` → **409** ("Expense category already exists").
- **DELETE is a soft delete**: sets `is_active = false`, returns
  `{ "data": { "success": true } }` (200). It does **not** remove the row, so
  historical `expense_records.category_id` FKs (ON DELETE RESTRICT) stay valid.
- Reactivate by `PATCH { "is_active": true }`.
- 404 when `:id` does not exist on get/update/delete.
- Do not allow creating a second category with the same name even if the existing
  one is inactive (unique constraint spans all rows); return 409.

---

## 3. Expense Records module

### 3.1 Purpose

Individual expense line entries (a rent payment, a utility bill, a cash purchase,
a supplier invoice booked as an expense). Each record belongs to one
`expense_categories` row, may optionally reference a `suppliers` row and an
originating `supplier_invoices` row. This table is the source for Monthly Expense
Tracking (§5) and the dashboard Monthly Expenses widget (spec `10`).

### 3.2 Table & columns owned (`expense_records`, spec `01` §5.4)

| Column         | Type            | Notes                                                        |
|----------------|-----------------|--------------------------------------------------------------|
| id             | bigint identity | PK                                                           |
| category_id    | bigint          | NOT NULL, FK → expense_categories(id) ON DELETE RESTRICT     |
| supplier_id    | bigint          | NULL, FK → suppliers(id) ON DELETE SET NULL                  |
| invoice_id     | bigint          | NULL, FK → supplier_invoices(id) ON DELETE SET NULL          |
| description    | text            | NOT NULL                                                     |
| amount         | numeric(12,2)   | NOT NULL, CHECK (amount >= 0)                                |
| expense_date   | date            | NOT NULL                                                     |
| payment_method | payment_method  | NULL (enum: cash, card, upi, bank_transfer, other)          |
| reference      | text            | NULL                                                        |
| created_by     | bigint          | NULL, FK → users(id) ON DELETE SET NULL                     |
| created_at     | timestamptz     | NOT NULL DEFAULT now()                                       |
| updated_at     | timestamptz     | NOT NULL DEFAULT now() (via `set_updated_at`)               |

Indexes: `idx_expense_records_category_id`, `idx_expense_records_expense_date`,
`idx_expense_records_supplier_id`.

### 3.3 Endpoints

Roles copied from spec `04` matrix, row **Expense records** (`owner CRUD`,
`manager CRUD`, `cashier R`, `store_manager CRUD`).

| Method | Path                        | Description                            | Allowed roles                        | Success |
|--------|-----------------------------|----------------------------------------|--------------------------------------|---------|
| GET    | `/api/expense-records`      | List expense records (paginated)       | manager, cashier, store_manager      | 200     |
| GET    | `/api/expense-records/:id`  | Get one expense record                 | manager, cashier, store_manager      | 200     |
| POST   | `/api/expense-records`      | Create an expense record               | manager, store_manager               | 201     |
| PATCH  | `/api/expense-records/:id`  | Update an expense record               | manager, store_manager               | 200     |
| DELETE | `/api/expense-records/:id`  | Hard delete an expense record          | manager                              | 200     |

> Matrix notes: **cashier** is **read-only** (list + get). Create/update require
> `manager` or `store_manager`. Hard delete is restricted to `manager` (or `owner`
> via bypass) per §3.7.

### 3.4 List query params

| Param        | Type   | Rule                                                                          |
|--------------|--------|-------------------------------------------------------------------------------|
| `page`       | number | default 1                                                                     |
| `limit`      | number | default 20, max 100                                                           |
| `sort`       | string | whitelist: `expense_date`, `amount`, `created_at`; default `-expense_date`    |
| `category_id`| number | optional; filter by category                                                  |
| `supplier_id`| number | optional; filter by supplier                                                  |
| `invoice_id` | number | optional; filter records linked to an invoice                                 |
| `from_date`  | string | optional; `z.coerce.date()`; `expense_date >= from_date`                       |
| `to_date`    | string | optional; `z.coerce.date()`; `expense_date <= to_date`                         |
| `month`      | string | optional; `YYYY-MM`; convenience filter = records where `date_trunc('month', expense_date) = month` |
| `search`     | string | optional; `ILIKE` on `description` and `reference`                            |

- If both `month` and `from_date`/`to_date` are supplied, `from_date`/`to_date`
  take precedence (document; do not error).

### 3.5 Body shapes (Zod)

```js
// createSchema (.strict())
{
  category_id: z.coerce.number().int().positive(),
  supplier_id: z.coerce.number().int().positive().optional().nullable(),
  invoice_id: z.coerce.number().int().positive().optional().nullable(),
  description: z.string().trim().min(1).max(500),
  amount: z.coerce.number().nonnegative(),            // amount >= 0
  expense_date: z.coerce.date(),                       // required
  payment_method: z.enum(['cash','card','upi','bank_transfer','other']).optional().nullable(),
  reference: z.string().trim().max(200).optional().nullable(),
}

// updateSchema = createSchema.partial().strict()  (at least one key required)
```

- `created_by` is **not** accepted from the client; the service sets it from
  `req.user.id`.
- `amount` serialized as a fixed-2 number in responses.

### 3.6 Example create request/response

Request `POST /api/expense-records`:

```json
{
  "category_id": 7,
  "supplier_id": 3,
  "invoice_id": null,
  "description": "July electricity bill",
  "amount": 8450.00,
  "expense_date": "2026-07-20",
  "payment_method": "bank_transfer",
  "reference": "TXN-559120"
}
```

Response `201 Created`:

```json
{
  "data": {
    "id": 142,
    "category_id": 7,
    "supplier_id": 3,
    "invoice_id": null,
    "description": "July electricity bill",
    "amount": 8450.00,
    "expense_date": "2026-07-20",
    "payment_method": "bank_transfer",
    "reference": "TXN-559120",
    "created_by": 2,
    "created_at": "2026-07-25T09:20:00.000Z",
    "updated_at": "2026-07-25T09:20:00.000Z"
  }
}
```

### 3.7 Business rules & edge cases

- `amount >= 0` enforced by Zod and by the DB `CHECK (amount >= 0)` (`23514` →
  **422** if bypassed).
- `expense_date` is **required** (NOT NULL).
- **Category FK validation:** `category_id` must reference an existing
  `expense_categories` row. Missing category → Postgres `23503` → **409** (or
  **422** "category_id references a non-existent expense category"). Prefer an
  explicit existence check in the service returning **422** with a field error so
  the client can correct it; fall back to the DB code mapping (spec `05` §2.2).
- **Optional supplier link:** `supplier_id` may be null; if provided it must exist
  (`suppliers`), else 422/409. On supplier delete the FK is `SET NULL` (record
  survives).
- **Optional invoice link:** `invoice_id` may be null; if provided it must exist
  (`supplier_invoices`), else 422/409. On invoice delete the FK is `SET NULL`.
  This is the same link the invoice→expense action in §4.9 sets.
- **Who can create:** `owner`, `manager`, `store_manager` (matrix). `cashier` is
  read-only.
- `created_by` recorded from `req.user`.
- 404 on get/update/delete when `:id` is unknown.
- **DELETE is a hard delete** (transactional records are hard-deletable only for
  owner/manager, spec `01` §1.4). Returns `{ "data": { "success": true } }`.

---

## 4. Supplier Invoices module

### 4.1 Purpose

Manual entry and management of invoices received from suppliers, including nested
line items and an uploaded invoice file (PDF/image) whose path is stored as
`file_url`. Invoice header totals (`subtotal`, `tax`, `total`) are **recomputed
from line items** by the service — client totals are never trusted. An invoice
moves through a status lifecycle and can optionally spawn an `expense_records`
row once verified.

> **Phase 1 boundary (restated):** manual CRUD + line items + file-upload metadata
> only. No OCR. `ocr_raw` stays null. The Excel expense register is Phase 2.

### 4.2 Tables & columns owned

`supplier_invoices` (spec `01` §5.4):

| Column         | Type            | Notes                                                        |
|----------------|-----------------|--------------------------------------------------------------|
| id             | bigint identity | PK                                                           |
| invoice_number | text            | NOT NULL                                                     |
| supplier_id    | bigint          | NOT NULL, FK → suppliers(id) ON DELETE RESTRICT             |
| invoice_date   | date            | NULL                                                        |
| due_date       | date            | NULL                                                        |
| subtotal       | numeric(12,2)   | NOT NULL DEFAULT 0 (recomputed from items)                  |
| tax            | numeric(12,2)   | NOT NULL DEFAULT 0                                          |
| total          | numeric(12,2)   | NOT NULL DEFAULT 0 (subtotal + tax)                         |
| status         | invoice_status  | NOT NULL DEFAULT 'pending' (pending/verified/paid/disputed) |
| file_url       | text            | NULL (path/URL to uploaded PDF/image)                       |
| ocr_raw        | jsonb           | NULL — **Phase 2 only; stays null in Phase 1**              |
| notes          | text            | NULL                                                        |
| created_by     | bigint          | NULL, FK → users(id) ON DELETE SET NULL                     |
| created_at     | timestamptz     | NOT NULL DEFAULT now()                                       |
| updated_at     | timestamptz     | NOT NULL DEFAULT now() (via `set_updated_at`)               |

- Unique: `uq_supplier_invoices_supplier_number` on (supplier_id, invoice_number).
- Indexes: `idx_supplier_invoices_supplier_id`, `idx_supplier_invoices_status`,
  `idx_supplier_invoices_invoice_date`.

`supplier_invoice_items` (spec `01` §5.4):

| Column      | Type            | Notes                                                        |
|-------------|-----------------|--------------------------------------------------------------|
| id          | bigint identity | PK                                                           |
| invoice_id  | bigint          | NOT NULL, FK → supplier_invoices(id) ON DELETE CASCADE      |
| product_id  | bigint          | NULL, FK → products(id) ON DELETE SET NULL                  |
| description | text            | NOT NULL                                                     |
| quantity    | numeric(12,3)   | NOT NULL, CHECK (quantity > 0)                              |
| unit_price  | numeric(12,2)   | NOT NULL                                                    |
| line_total  | numeric(12,2)   | NOT NULL (quantity * unit_price, computed by service)       |

- Index: `idx_supplier_invoice_items_invoice_id`.

### 4.3 Endpoints

Roles copied from spec `04` matrix, row **Supplier invoices** (`owner CRUD`,
`manager CRUD`, `store_manager CRUD`).

| Method | Path                                   | Description                                           | Allowed roles                   | Success |
|--------|----------------------------------------|-------------------------------------------------------|---------------------------------|---------|
| GET    | `/api/supplier-invoices`               | List invoices (paginated, filters)                    | manager, store_manager          | 200     |
| GET    | `/api/supplier-invoices/:id`           | Get one invoice **with its line items**               | manager, store_manager          | 200     |
| POST   | `/api/supplier-invoices`               | Create invoice + line items (transactional)           | manager, store_manager          | 201     |
| PATCH  | `/api/supplier-invoices/:id`           | Update header fields and/or replace line items        | manager, store_manager          | 200     |
| DELETE | `/api/supplier-invoices/:id`           | Hard delete invoice (cascades items)                  | manager                         | 200     |
| POST   | `/api/supplier-invoices/:id/file`      | Upload invoice file (multipart), store `file_url`     | manager, store_manager          | 200     |
| POST   | `/api/supplier-invoices/:id/status`    | Transition status (lifecycle §4.8)                    | manager, store_manager          | 200     |
| POST   | `/api/supplier-invoices/:id/expense`   | Generate an `expense_records` row from a verified invoice (§4.9) | manager, store_manager | 201     |

> Matrix note: all three of owner/manager/store_manager have full CRUD. Hard
> delete is restricted to `manager`/`owner` per §4.10 (transactional record delete
> rule, spec `01` §1.4). Line-item management is done through the create/update
> endpoints (nested), not separate item routes, to keep header totals authoritative.

### 4.4 List query params

| Param        | Type   | Rule                                                                        |
|--------------|--------|-----------------------------------------------------------------------------|
| `page`       | number | default 1                                                                   |
| `limit`      | number | default 20, max 100                                                         |
| `sort`       | string | whitelist: `invoice_date`, `total`, `status`, `created_at`; default `-invoice_date` (nulls last), fallback `-created_at` |
| `supplier_id`| number | optional; filter by supplier                                                |
| `status`     | string | optional; `z.enum(['pending','verified','paid','disputed'])`               |
| `from_date`  | string | optional; `z.coerce.date()`; `invoice_date >= from_date`                    |
| `to_date`    | string | optional; `z.coerce.date()`; `invoice_date <= to_date`                      |
| `search`     | string | optional; `ILIKE` on `invoice_number` and `notes`                          |

### 4.5 Body shapes (Zod)

```js
// itemSchema (.strict())
const itemSchema = z.object({
  id: z.coerce.number().int().positive().optional(), // present = update existing item
  product_id: z.coerce.number().int().positive().optional().nullable(),
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive(),            // quantity > 0
  unit_price: z.coerce.number().nonnegative(),
  // line_total is NOT accepted from client; service computes quantity * unit_price
});

// createSchema (.strict())
{
  invoice_number: z.string().trim().min(1).max(100),
  supplier_id: z.coerce.number().int().positive(),
  invoice_date: z.coerce.date().optional().nullable(),
  due_date: z.coerce.date().optional().nullable(),
  tax: z.coerce.number().nonnegative().optional().default(0),  // tax amount, not percent
  status: z.enum(['pending','verified','paid','disputed']).optional().default('pending'),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(itemSchema).min(1),                 // at least one line item
}

// updateSchema (.strict()) — header fields partial; items optional full replace
{
  invoice_number: z.string().trim().min(1).max(100).optional(),
  supplier_id: z.coerce.number().int().positive().optional(),
  invoice_date: z.coerce.date().optional().nullable(),
  due_date: z.coerce.date().optional().nullable(),
  tax: z.coerce.number().nonnegative().optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(itemSchema).min(1).optional(),      // when present, replaces the set (§4.7)
}
```

- `subtotal`, `total`, `line_total`, `file_url`, `ocr_raw`, `created_by` are
  **never** accepted from the client. `subtotal`/`total`/`line_total` are computed
  (§4.6). `status` on update goes through the dedicated status endpoint (§4.8);
  `updateSchema` does not accept `status`.

### 4.6 Totals recomputation (authoritative)

The service always computes, inside the transaction:

```
line_total  = round(quantity * unit_price, 2)   // per item
subtotal    = sum(line_total for all items)
total       = round(subtotal + tax, 2)          // tax is the header tax amount
```

- Client-supplied `subtotal`/`total`/`line_total` are ignored. This mirrors the
  order-totals rule (spec `06`) and PO-totals rule (spec `07`).

### 4.7 Nested line-item management (add / update / remove)

On `POST` (create) and `PATCH` (update) when `items` is present, the service runs
a single transaction (`withTransaction`, spec `05` §6):

1. Upsert the invoice header row.
2. **Reconcile items** against the submitted `items` array:
   - Items **with `id`** that match existing rows → **update** (description,
     product_id, quantity, unit_price, recomputed line_total).
   - Items **without `id`** → **insert**.
   - Existing item rows whose `id` is **absent** from the submitted array →
     **delete** (remove).
   - Guard: every submitted item `id` must belong to this invoice, else
     `ApiError(422, "Line item does not belong to this invoice")`.
3. Recompute `subtotal`/`total` (§4.6) and update the header.
4. Commit. On any error, ROLLBACK (no partial writes).

- On `PATCH` where `items` is **omitted**, existing items are left untouched;
  header fields update only, and totals are recomputed from the untouched items.

### 4.8 Status lifecycle — `POST /api/supplier-invoices/:id/status`

Enum `invoice_status`: `pending`, `verified`, `paid`, `disputed`.

Allowed transitions:

```
pending   -> verified | disputed
verified  -> paid | disputed
disputed  -> verified | pending
paid       (terminal)                     # no transition out of paid in Phase 1
```

Body (Zod):

```js
{ status: z.enum(['pending','verified','paid','disputed']) }
```

- Invalid transition (e.g. `pending -> paid`, or any transition out of `paid`) →
  `ApiError(409, "Invalid invoice status transition")`.
- Same-status no-op returns the current invoice with 200 (idempotent) or 409;
  recommended: treat setting the same status as a 200 no-op.
- Response is the updated invoice (200).

### 4.9 Generate expense from a verified invoice — `POST /api/supplier-invoices/:id/expense`

Convenience action that books a verified invoice as an `expense_records` row and
links it back via `invoice_id`.

Body (Zod, optional overrides):

```js
{
  category_id: z.coerce.number().int().positive(),               // required: which expense bucket
  expense_date: z.coerce.date().optional(),                       // default: invoice.invoice_date or today
  payment_method: z.enum(['cash','card','upi','bank_transfer','other']).optional().nullable(),
  reference: z.string().trim().max(200).optional().nullable(),
}
```

Rules:

- Invoice must exist (404) and be in `verified` (or `paid`) status; otherwise
  `ApiError(409, "Invoice must be verified before booking as an expense")`.
- Creates an `expense_records` row with `amount = invoice.total`,
  `supplier_id = invoice.supplier_id`, `invoice_id = invoice.id`,
  `description = "Invoice " + invoice.invoice_number`, `created_by = req.user.id`,
  and the supplied `category_id`.
- **Idempotency:** if an `expense_records` row already links this `invoice_id`,
  return `ApiError(409, "An expense already exists for this invoice")` (prevents
  double-booking). Enforce with a service check on `expense_records.invoice_id`.
- Returns the new expense record (201).

### 4.10 File upload — `POST /api/supplier-invoices/:id/file`

Uses the existing multer middleware `Backend/src/middlewares/upload.middleware.js`;
files are saved on disk under `Backend/src/uploads/`, and **only the path/URL** is
persisted in `supplier_invoices.file_url` (spec `01` §5.4). No binary is stored in
Postgres.

- **Multipart** form field: `file` (single file).
- **Supported types (mime allow-list):** `application/pdf`, `image/png`,
  `image/jpeg`, `image/jpg`, `image/webp`. Reject others →
  `ApiError(422, "Unsupported file type; allowed: PDF, PNG, JPG, WEBP")`.
- **Max size:** 10 MB (enforced by multer `limits.fileSize`); exceeded →
  `ApiError(422, "File exceeds 10 MB limit")` (map multer `LIMIT_FILE_SIZE`).
- On success: set `file_url` to the stored relative path (e.g.
  `/uploads/<generated-filename>.pdf`) and update the row.
- Invoice must exist (404). Replacing an existing file overwrites `file_url`
  (deleting the old file on disk is optional in Phase 1; document if skipped).
- `ocr_raw` is **not** touched here — it remains null (OCR is Phase 2).

> Alternative allowed: accept the file as multipart on `POST /api/supplier-invoices`
> at create time (same middleware, same mime/size rules, same `file_url` write).
> If chosen, keep the dedicated `:id/file` endpoint too for re-upload. Pick one
> create path and document it. Default: create is JSON; file goes to `:id/file`.

Response `200 OK`:

```json
{ "data": { "id": 55, "file_url": "/uploads/inv-55-1690000000000.pdf" } }
```

### 4.11 Example create request/response

Request `POST /api/supplier-invoices`:

```json
{
  "invoice_number": "SUP-2026-0455",
  "supplier_id": 3,
  "invoice_date": "2026-07-18",
  "due_date": "2026-08-17",
  "tax": 540.00,
  "notes": "Monthly produce delivery",
  "items": [
    { "product_id": 12, "description": "Tomatoes 10kg crate", "quantity": 5, "unit_price": 900.00 },
    { "product_id": 15, "description": "Onions 25kg sack",    "quantity": 3, "unit_price": 1200.00 }
  ]
}
```

Response `201 Created`:

```json
{
  "data": {
    "id": 55,
    "invoice_number": "SUP-2026-0455",
    "supplier_id": 3,
    "invoice_date": "2026-07-18",
    "due_date": "2026-08-17",
    "subtotal": 8100.00,
    "tax": 540.00,
    "total": 8640.00,
    "status": "pending",
    "file_url": null,
    "ocr_raw": null,
    "notes": "Monthly produce delivery",
    "created_by": 2,
    "created_at": "2026-07-25T09:30:00.000Z",
    "updated_at": "2026-07-25T09:30:00.000Z",
    "items": [
      { "id": 201, "invoice_id": 55, "product_id": 12, "description": "Tomatoes 10kg crate", "quantity": 5, "unit_price": 900.00, "line_total": 4500.00 },
      { "id": 202, "invoice_id": 55, "product_id": 15, "description": "Onions 25kg sack", "quantity": 3, "unit_price": 1200.00, "line_total": 3600.00 }
    ]
  }
}
```

`subtotal = 4500 + 3600 = 8100`; `total = 8100 + 540 = 8640`; `ocr_raw` null.

### 4.12 Business rules & edge cases

- **Unique (supplier_id, invoice_number)** (`uq_supplier_invoices_supplier_number`).
  Duplicate → Postgres `23505` → **409** ("An invoice with this number already
  exists for this supplier").
- **Supplier FK** (`ON DELETE RESTRICT`): `supplier_id` must exist. Missing →
  `23503` → 409/422. A supplier with invoices cannot be deleted (enforced by the
  suppliers module, spec `07`).
- **At least one line item** on create (`items.min(1)`).
- **Totals** always recomputed (§4.6); client totals ignored.
- **Writes are transactional** (`withTransaction`) — header + items succeed or
  fail together.
- **`ocr_raw` stays null** in Phase 1; not settable via any endpoint.
- `created_by` recorded from `req.user`.
- `GET /:id` returns the invoice **with its `items`** array; `GET /` list returns
  headers only (no items) for performance — document.

---

## 5. Monthly Expense Tracking (read-only aggregation)

### 5.1 Purpose

Read-only reporting endpoints that aggregate `expense_records` by month and by
category. Built on the `monthly_expense_summary` view (spec `01` §5.5). This is
the same data that feeds the dashboard **Monthly Expenses** widget (spec `10`);
keeping the aggregation in the view avoids duplicating SQL across specs `08` and
`10`.

`monthly_expense_summary` (view, spec `01` §5.5):

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

### 5.2 Endpoints

Roles copied from spec `04` matrix, row **Monthly expense tracking** (`owner R`,
`manager R`, `cashier R`, `store_manager R`). Read-only for all four (plus owner
bypass). No create/update/delete.

| Method | Path                              | Description                                                   | Allowed roles                          | Success |
|--------|-----------------------------------|--------------------------------------------------------------|----------------------------------------|---------|
| GET    | `/api/expenses/monthly`           | Per-month totals + per-category breakdown for a year         | manager, cashier, store_manager        | 200     |
| GET    | `/api/expenses/monthly/summary`   | Single-month detail (per-category rows for one `month`)      | manager, cashier, store_manager        | 200     |

> These live in the `expenses` module (`Backend/src/modules/expenses/`), separate
> from `expense-records`, because they are read-only aggregations over the view.

### 5.3 Query params

`GET /api/expenses/monthly`:

| Param  | Type   | Rule                                                                   |
|--------|--------|------------------------------------------------------------------------|
| `year` | number | `z.coerce.number().int().min(2000).max(2100)`; default = current year |

`GET /api/expenses/monthly/summary`:

| Param   | Type   | Rule                                                    |
|---------|--------|---------------------------------------------------------|
| `month` | string | `YYYY-MM`, required; the month to break down            |

- These are aggregation endpoints and do **not** paginate (bounded, at most 12
  months / a handful of categories). Return the full result in `data`; place
  totals in `meta`.

### 5.4 Example response — `GET /api/expenses/monthly?year=2026`

`data` is an array of one object per month that has expenses (or all 12 months
with zero totals — choose one and document; default: only months with data,
ordered ascending). Each object carries `total_amount` and a `by_category`
breakdown.

```json
{
  "data": [
    {
      "month": "2026-06-01",
      "total_amount": 41250.00,
      "record_count": 9,
      "by_category": [
        { "category_id": 7, "category_name": "Utilities", "total_amount": 12300.00, "record_count": 3 },
        { "category_id": 4, "category_name": "Supplies",  "total_amount": 28950.00, "record_count": 6 }
      ]
    },
    {
      "month": "2026-07-01",
      "total_amount": 53600.00,
      "record_count": 11,
      "by_category": [
        { "category_id": 7, "category_name": "Utilities", "total_amount": 8450.00,  "record_count": 1 },
        { "category_id": 4, "category_name": "Supplies",  "total_amount": 36510.00, "record_count": 8 },
        { "category_id": 2, "category_name": "Rent",      "total_amount": 8640.00,  "record_count": 2 }
      ]
    }
  ],
  "meta": {
    "year": 2026,
    "total_amount": 94850.00
  }
}
```

- The service reads `monthly_expense_summary` filtered to the requested year,
  joins `expense_categories` for `category_name`, groups rows into months, and
  sums per-month and per-year totals in the mapper.
- `month` is the first day of the month (matches the view's
  `date_trunc('month', ...)::date`).
- Amounts are fixed-2 numbers.

### 5.5 Business rules & edge cases

- Read-only. No writes; no soft/hard delete concerns here.
- Empty year → `{ "data": [], "meta": { "year": 2026, "total_amount": 0 } }`.
- `month` for the summary endpoint must parse as `YYYY-MM`; otherwise 422.
- Aggregation is over `expense_records` only (via the view). Supplier invoices are
  reflected here **only** when booked as an expense (§4.9); un-booked invoices do
  not appear. Document this so the dashboard number is unambiguous.
- If the `monthly_expense_summary` view is not created, the service replicates the
  same `GROUP BY date_trunc('month', expense_date), category_id` query inline
  (spec `01` §5.5 permits either; document the choice in the README).

---

## 6. Soft delete vs hard delete (summary)

| Resource             | DELETE behavior                    | Allowed roles      | Notes                                                        |
|----------------------|------------------------------------|--------------------|-------------------------------------------------------------|
| `expense_categories` | **Soft** (`is_active = false`)     | manager (owner)    | Config/reference row; preserves FK history (spec `01` §1.4). |
| `expense_records`    | **Hard** (row removed)             | manager (owner)    | Transactional record; hard delete allowed for owner/manager. |
| `supplier_invoices`  | **Hard** (cascades items)          | manager (owner)    | `supplier_invoice_items` deleted via ON DELETE CASCADE; linked `expense_records.invoice_id` set NULL. |
| Monthly tracking     | n/a                                | —                  | Read-only aggregation.                                       |

- `store_manager` can create/update expense records and invoices but **cannot**
  hard-delete them (matrix restricts delete on transactional records to
  manager/owner; store_manager is not listed for those DELETE routes above).
  `store_manager` also cannot delete expense categories (RU only).

---

## 7. Error cases (per spec `05` §2.2 mapping)

| Case                                                             | Status | Message (example)                                            |
|------------------------------------------------------------------|--------|--------------------------------------------------------------|
| Unknown `:id` on get/update/delete/status/file/expense           | 404    | "Expense record not found" / "Supplier invoice not found"    |
| Zod validation failure (bad/missing fields)                      | 422    | "Validation failed" + `errors[]`                             |
| `amount < 0` / `quantity <= 0` reaching DB (`23514`)             | 422    | "Value violates a constraint"                                |
| Duplicate category name (`23505` on `uq_expense_categories_name`)| 409    | "Expense category already exists"                            |
| Duplicate invoice (`23505` on `uq_supplier_invoices_supplier_number`) | 409 | "An invoice with this number already exists for this supplier" |
| FK to missing category/supplier/invoice (`23503`)                | 409/422| "Referenced record not found"                                |
| Invalid invoice status transition                                | 409    | "Invalid invoice status transition"                          |
| Booking expense from a non-verified invoice                      | 409    | "Invoice must be verified before booking as an expense"      |
| Expense already booked for invoice (§4.9 idempotency)            | 409    | "An expense already exists for this invoice"                 |
| Line item id not belonging to invoice (§4.7)                     | 422    | "Line item does not belong to this invoice"                  |
| Unsupported upload mime type                                     | 422    | "Unsupported file type; allowed: PDF, PNG, JPG, WEBP"        |
| Upload exceeds size limit (multer `LIMIT_FILE_SIZE`)             | 422    | "File exceeds 10 MB limit"                                   |
| Missing/invalid JWT                                              | 401    | "Authentication required"                                    |
| Role not permitted for route/verb                               | 403    | "You do not have permission to perform this action"          |

- No stack traces or raw SQL leak to the client (spec `05` §2.2). Full error is
  logged server-side.

---

## 8. Acceptance checklist

Expense Categories:
- [ ] Full CRUD wired with matrix roles (create/delete = manager/owner; update =
      manager/store_manager/owner; read = manager/store_manager/owner).
- [ ] DELETE soft-deletes (`is_active = false`); duplicate name → 409.
- [ ] List paginates, sorts (whitelist), filters by `search`/`is_active`.

Expense Records:
- [ ] Create/update/delete/read wired; cashier is read-only; delete = manager/owner.
- [ ] `amount >= 0` and required `expense_date` enforced (Zod + DB check).
- [ ] `category_id` FK validated; optional `supplier_id`/`invoice_id` validated.
- [ ] `created_by` set from `req.user`, never from client.
- [ ] List filters: `category_id`, `supplier_id`, `invoice_id`, `from_date`,
      `to_date`, `month`, `search`; sort whitelist enforced.

Supplier Invoices:
- [ ] Manual CRUD only; `ocr_raw` stays null; no OCR/Excel logic present.
- [ ] Unique (supplier_id, invoice_number) → 409 on duplicate.
- [ ] Nested items add/update/remove reconciled correctly (§4.7).
- [ ] `subtotal`/`tax`/`total`/`line_total` recomputed from items; client totals
      ignored.
- [ ] Header + items written in a single transaction (`withTransaction`).
- [ ] Status lifecycle enforced (pending→verified→paid, disputed); invalid
      transition → 409.
- [ ] File upload via `upload.middleware.js` stores file under
      `Backend/src/uploads/` and persists `file_url`; mime + size validated.
- [ ] Optional generate-expense action links `expense_records.invoice_id`, is
      idempotent, and requires a verified invoice.
- [ ] `GET /:id` returns items; hard delete cascades items; delete = manager/owner.

Monthly Expense Tracking:
- [ ] Read-only endpoints for manager/cashier/store_manager/owner.
- [ ] `GET /api/expenses/monthly?year=YYYY` returns per-month totals with
      `by_category` breakdown; per-year total in `meta`.
- [ ] Built on `monthly_expense_summary` view (or documented inline query).
- [ ] Empty year returns empty `data` with zero total; feeds dashboard widget
      (spec `10`).

Cross-cutting:
- [ ] All routes under `/api`; `{ data, meta }` success envelope; `{ message, errors }`
      error envelope.
- [ ] RBAC enforced server-side per the spec `04` matrix; unauthorized role → 403,
      missing token → 401.
- [ ] All SQL parameterized; sort columns whitelisted; no client input concatenated
      into SQL.
