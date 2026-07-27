# Architecture Notes

This document explains how the RestaurantOS services fit together. It is intentionally service-focused so it can support separate service-wise diagrams.

## High-Level Shape

RestaurantOS has three application services and one main database.

```text
Next.js Frontend
Express Backend API
FastAPI AI Service
PostgreSQL Database
```

The frontend is the user interface. The Express backend owns the core restaurant product. The FastAPI service owns AI and OCR work. PostgreSQL is the source of truth for application data.

## Frontend

The frontend is a Next.js dashboard used by all roles.

It handles:

- login screen and dashboard layout
- role-aware navigation
- CRUD pages
- order screens
- invoice AI review screens
- notification bell and toasts
- WebSocket subscription for order updates

Frontend role checks are for user experience only. They make the UI easier to use, but they are not the security boundary.

## Express Backend API

The Express backend owns normal restaurant operations.

It handles:

- authentication
- password hashing
- JWT issuing
- RBAC middleware
- core CRUD modules
- dashboard data
- audit logs
- notifications
- CSV import/export
- order WebSocket events
- final PostgreSQL writes for product data

The backend is the main product API. If a request changes restaurant data, the Express backend usually owns the rule unless it is specifically part of AI invoice approval.

## FastAPI AI Service

The FastAPI service owns AI and OCR workflows.

It handles:

- invoice upload imports
- OCR extraction
- invoice extraction normalization
- supplier matching suggestions
- AI recommendation endpoints
- cached AI insights
- Excel expense register export

The AI service verifies the same JWT as the Express backend. Users do not have a separate AI login.

AI output is staged first. It does not become a real supplier invoice until a user reviews and approves it.

## PostgreSQL

PostgreSQL is the source of truth for RestaurantOS.

It stores:

- users and roles
- tables
- orders and order items
- menu and recipes
- ingredients and inventory
- suppliers and purchases
- expenses and invoices
- AI invoice import rows
- audit logs
- notification seen state

Files are not stored directly in PostgreSQL. The database stores file metadata and references, such as `file_url` and `cloudinary_public_id`.

## File Storage

Cloudinary is used for uploaded files when configured. Local fallback storage is used when Cloudinary is not configured.

Correct relationship:

```text
Backend or AI Service -> Cloudinary
Backend or AI Service -> PostgreSQL metadata
```

PostgreSQL does not talk to Cloudinary. Services coordinate both the file upload and the database row.

## Normal Request Flow

For normal product features:

```text
User -> Frontend -> Express Backend -> PostgreSQL
```

Example: creating a menu item.

1. User submits the form in the frontend.
2. Frontend sends a REST request with the JWT.
3. Express verifies auth and role.
4. Express validates the payload.
5. Express writes to PostgreSQL.
6. Express writes an audit log row.
7. Frontend refetches and shows the updated list.

## AI Invoice Flow

For AI invoice upload:

```text
User -> Frontend -> FastAPI AI Service
FastAPI AI Service -> Cloudinary
FastAPI AI Service -> PostgreSQL
FastAPI AI Service -> Veryfi OCR, if configured
```

The uploaded file goes to storage. PostgreSQL stores the import row and file reference. OCR output is saved as staged extracted data. A real supplier invoice is created only after approval.

## AI Recommendation Flow

For recommendation endpoints:

```text
Frontend -> FastAPI AI Service -> PostgreSQL -> Grok AI -> FastAPI -> Frontend
```

The AI service reads current restaurant data from PostgreSQL, sends a summarized prompt to the AI provider, and returns a recommendation. Recommendation endpoints do not directly mutate product tables.

## Realtime Order Flow

Orders use a narrow WebSocket channel because kitchen handoff needs fast updates.

```text
Frontend REST mutation -> Express Backend -> PostgreSQL
Express Backend -> WebSocket /ws -> subscribed frontend screens
Frontend refetches REST data
```

The WebSocket event is only a signal. The frontend refetches from the REST API, so PostgreSQL remains the source of truth.

Only order lifecycle events use WebSockets. Other areas use normal fetch or polling.

## Polling Decisions

Polling is used where background status is more important than instant updates.

Invoice AI extraction uses polling because extraction may take time and can be processed by a background task or worker.

The notification bell also polls because most notifications do not need instant delivery.

## Background Processing

AI invoice imports can run in two modes.

Redis/RQ mode:

- invoice job is put into Redis
- an RQ worker processes it
- better separation for production

Inline background mode:

- FastAPI schedules the job after the upload response
- simpler for local and demo deployments
- less durable if the service restarts during processing

If Redis is enabled, a real worker must also be running.

## Deployment Model

The intended deployment is simple managed hosting.

```text
Frontend: Vercel
Express Backend: Render or similar Node host
FastAPI AI Service: Render or similar Python host
Database: Neon PostgreSQL
File storage: Cloudinary
```

Vercel and Render can auto-deploy from the main branch. GitHub Actions workflows are present for frontend, backend, and AI service checks.

## CI Checks

The repository has separate workflows for:

- frontend build
- backend tests with a temporary PostgreSQL service
- AI service pytest tests

Backend CI uses a disposable Postgres container. AI tests mock external providers and do not call paid services.

## Security Boundaries

Important boundaries:

- RBAC is enforced by backend services, not only by the frontend.
- `JWT_SECRET` must match between Express and FastAPI.
- Production API keys are not needed for tests.
- AI output is reviewed before approval.
- WebSocket connections authenticate with JWT.

## Known Limitations

- WebSocket broadcasting is in-process and assumes a single backend instance.
- If the backend scales horizontally, Redis pub/sub is needed for WebSocket fan-out.
- Dark/light mode is not delivered yet.
- Inline invoice background processing is less durable than a dedicated queue worker.
- Express Swagger UI is not implemented; `Documentation/API.md` is the written API reference.
