# RestaurantOS

RestaurantOS is a full-stack restaurant management platform scaffolded for the technical assessment.

## Apps

- `Frontend` - Next.js application for the restaurant dashboard and workflows.
- `Backend` - Express API for authentication, RBAC, restaurant operations, inventory, expenses, invoices, and dashboard data.
- `ai-service` - FastAPI service reserved for OCR and AI features.

## First Implementation Order

1. Backend foundation: Express app, PostgreSQL connection, auth, RBAC, and shared error handling.
2. Core CRUD modules: users, tables, menu, orders, inventory, expenses, invoices, and dashboard.
3. Frontend routes and reusable dashboard UI.
4. AI invoice processing and prediction endpoints in `ai-service`.

## Local Infrastructure

Start PostgreSQL with Docker:

```bash
docker compose up -d postgres
```

Application Dockerfiles should be added after the backend and frontend startup
commands stabilize. Containerizing unfinished app entry points early creates
extra maintenance without improving the assessment foundation.
## Realtime

Orders use a narrow WebSocket channel at the Express backend `/ws` endpoint. The browser connects directly to the backend with the same JWT used for the REST API; only owner, manager, chef, waiter, and cashier sockets receive compact order events. The Orders page and dashboard treat those events as refetch signals, so PostgreSQL remains the source of truth.

All other live-ish surfaces keep their existing polling or on-action fetch behavior. If the socket is unavailable, the order surfaces silently fall back to 5 second polling. The in-process broadcaster is single-instance only, which fits the current Render-style deployment. If the backend is scaled horizontally, add Redis pub/sub between instances before relying on WebSocket fan-out.

