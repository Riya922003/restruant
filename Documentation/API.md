# RestaurantOS API Reference

Compact reference for both services. For request/response field details, see the
validation schemas (`Backend/src/modules/*/**.validation.js`) and the Pydantic
models in `ai-service/app/schemas/`.

## Basics

- **Express API** base URL: `<backend>/api` (local `http://localhost:4000/api`).
- **AI service** base URL: `<ai>` (local `http://localhost:8000`), routes under `/ai`.
- **Auth:** all routes except `POST /auth/login`, the doc routes, and `/health`
  require `Authorization: Bearer <jwt>`. Both services verify the **same** HS256
  token (shared `JWT_SECRET`); the AI service re-derives the user from it.
- **Envelope:** success is `{ "data": <payload>, "meta": {...} }` (meta only on
  lists); errors are `{ "message": "...", "errors": [{ "field", "message" }] }`
  with a matching HTTP status (401 no/invalid token, 403 wrong role, 422
  validation, 404, 409 conflict).
- **RBAC:** enforced server-side. **`owner` is allowed everywhere** (bypass); the
  role lists below are the *additional* roles permitted. Frontend gating is UX only.
- **List params:** `page`, `limit` (max 100), `sort` (e.g. `-created_at`, whitelisted),
  `search`, plus per-resource filters. Lists return `meta: { page, limit, total, totalPages }`.

## Express API

### Auth (`/auth`)
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | Returns `{ token, user }` |
| GET | `/auth/me` | any | Current user |
| POST | `/auth/logout` | any | |
| POST | `/auth/change-password` | any | Self password change |

### Users / Staff (`/users`)
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/users`, `/users/:id` | manager | List / read |
| POST | `/users` | manager | Create staff |
| PATCH | `/users/:id` | manager | Update (role, active, etc.) |
| POST | `/users/:id/reset-password` | manager | Admin reset |
| DELETE | `/users/:id` | manager | Deactivate |

### Tables (`/tables`)
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/tables`, `/tables/:id` | manager, chef, waiter, cashier | Filters: `status`, `search` |
| POST | `/tables` | manager | |
| PATCH | `/tables/:id` | manager, waiter | Update / set status |
| DELETE | `/tables/:id` | manager | |

### Orders (`/orders`)
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/orders`, `/orders/:id`, `/orders/:id/items` | manager, chef, waiter, cashier | Filters: `status`, `payment_status`, `search` |
| GET | `/orders/export` | manager, chef, waiter, cashier | CSV |
| POST | `/orders`, `/orders/:id/items` | manager, waiter | Create / add line |
| PATCH | `/orders/:id`, `/orders/:id/items/:itemId` | manager, waiter | |
| PATCH | `/orders/:id/status` | manager, chef, waiter | Lifecycle transition |
| POST | `/orders/:id/payment` | manager, cashier | Take payment |
| DELETE | `/orders/:id`, `/orders/:id/items/:itemId` | manager (cancel) / manager, waiter (line) | |

### Menu (`/menu-categories`, `/menu-items`)
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/menu-categories`, `/menu-items` (+ `/:id`) | manager, chef, waiter, cashier | Filters: `category_id`, `is_available`, `search` |
| POST / PATCH / DELETE | `/menu-categories`, `/menu-items` (`/:id`) | manager | CRUD |
| PATCH | `/menu-items/:id/availability` | manager, chef | Toggle available |

### Recipes (`/recipes`)
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/recipes`, `/recipes/:id` | manager, chef, waiter | `search` |
| POST / PATCH / DELETE | `/recipes` (`/:id`) | manager, chef | |
| PUT/POST/PATCH/DELETE | `/recipes/:id/ingredients[...]` | manager, chef | Manage BOM lines |

### Ingredients (`/ingredients`)
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/ingredients`, `/ingredients/:id` | manager, chef, store_manager | `search`, `low_stock` |
| POST / PATCH / DELETE | `/ingredients` (`/:id`) | manager, store_manager (+chef on PATCH) | |
| POST | `/ingredients/:id/adjust-stock` | manager, chef, store_manager | Stock adjustment |

### Inventory
| Method | Path | Roles | Notes |
|---|---|---|---|
| CRUD | `/product-categories`, `/warehouses` (`/:id`) | manager, store_manager | |
| GET/POST/PATCH/DELETE | `/products` (`/:id`) | manager, store_manager | `search`, `category_id`, `low_stock`, `is_active` |
| GET | `/products/export`, `/products/import/template` | manager, store_manager | CSV out / template |
| POST | `/products/import/preview`, `/products/import` | manager, store_manager | CSV import (dry run / commit) |
| GET/POST | `/stock-movements` (`/:id`) | manager, store_manager | Immutable ledger; `search` |

### Suppliers (`/suppliers`)
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/suppliers`, `/suppliers/:id` | manager, store_manager | `search`, `is_active` |
| GET | `/suppliers/export` | manager, store_manager | CSV |
| POST / PATCH / DELETE | `/suppliers` (`/:id`) | manager, store_manager | |

### Purchases (`/purchase-orders`)
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/purchase-orders`, `/:id` | manager, store_manager | `status`, `search` |
| GET | `/purchase-orders/export` | manager, store_manager | CSV |
| POST / PATCH / DELETE | `/purchase-orders` (`/:id`, `/:id/items[...]`) | manager, store_manager | |
| POST | `/purchase-orders/:id/receive` | manager, store_manager | Receive stock |

### Expenses
| Method | Path | Roles | Notes |
|---|---|---|---|
| CRUD | `/expense-categories` (`/:id`) | manager, store_manager | |
| GET/POST/PATCH/DELETE | `/expense-records` (`/:id`) | manager, store_manager, cashier | `category_id`, `from_date`, `to_date`, `search` |
| GET | `/expense-records/export` | manager, store_manager, cashier | CSV expense register |
| GET | `/expenses/monthly`, `/expenses/monthly/summary` | manager, store_manager, cashier | Aggregations |

### Supplier Invoices (`/supplier-invoices`)
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/supplier-invoices`, `/:id` | manager, store_manager | `supplier_id`, `status`, dates, `search` |
| GET | `/supplier-invoices/export` | manager, store_manager | CSV |
| POST / PATCH | `/supplier-invoices` (`/:id`) | manager, store_manager | |
| DELETE | `/supplier-invoices/:id` | manager | |
| POST | `/supplier-invoices/:id/file` | manager, store_manager | Upload file (multipart) |
| POST | `/supplier-invoices/:id/status` | manager, store_manager | Verify / pay / dispute |
| POST | `/supplier-invoices/:id/expense` | manager, store_manager | Book as expense (idempotent) |

### Dashboard (`/dashboard`)
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/dashboard/summary` | role-scoped | Combined widgets (`range=7d\|30d\|month`) |
| GET | `/dashboard/{active-orders,table-occupancy,low-stock}` | floor roles | Operational widgets |
| GET | `/dashboard/{sales,monthly-expenses,purchase-summary,profit,supplier-summary}` | owner, manager, store_manager | Financial widgets |

### Audit & Notifications
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/audit-logs`, `/audit-logs/facets` | manager | Activity trail; filters: `action`, `entity_type`, `actor_user_id`, dates |
| GET | `/notifications` | any | Role-scoped recent events + unread count |
| POST | `/notifications/seen` | any | Mark feed read |

## AI Service (FastAPI, under `/ai`)

Auto-generated interactive docs: **`<ai>/docs`** (Swagger) and **`<ai>/redoc`**.

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/health` | public | Liveness |
| GET | `/ai/me` | any | Echo identity from the shared JWT |
| POST | `/ai/inventory/shortage-prediction` | manager, store_manager, chef | Grok recommendation |
| POST | `/ai/inventory/reorder-suggestion` | manager, store_manager | Grok recommendation |
| POST | `/ai/inventory/waste-analysis` | manager, store_manager, chef | Grok recommendation |
| POST | `/ai/menu/pricing-suggestion` | manager | Grok recommendation |
| POST | `/ai/menu/prep-time-estimate` | manager, chef | Grok recommendation |
| GET | `/ai/insights/dashboard` | role-scoped | Cached insights for the dashboard card |
| POST | `/ai/invoices/upload` | manager, store_manager | Multi-file invoice upload; queues OCR |
| GET | `/ai/invoices/imports` (`/:id`, `/:id/file`) | manager, store_manager | Poll extraction status; original file |
| PATCH | `/ai/invoices/imports/:id` | manager, store_manager | Correct extracted fields / rename |
| POST | `/ai/invoices/imports/:id/approve` | manager, store_manager | Persist as a real supplier invoice |
| POST | `/ai/invoices/imports/:id/reject` | manager, store_manager | Reject extraction |
| DELETE | `/ai/invoices/imports/:id` | manager, store_manager | Remove import |
| GET | `/ai/invoices/expense-register.xlsx` | manager, store_manager | Excel expense register |

> The five recommendation endpoints are stateless reads: they compute from live
> PostgreSQL data, call Grok, echo the inputs used, and never mutate product tables.
