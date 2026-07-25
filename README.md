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
