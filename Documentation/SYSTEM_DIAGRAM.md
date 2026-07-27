# System Diagram Notes

This file is a guide for making the final system diagrams. The recommended approach is service-wise diagrams instead of one crowded diagram.

## Diagram 1: Overall System

Use this diagram to show the full system at a high level.

Boxes:

- Users / Roles
- Next.js Frontend
- Express Backend API
- FastAPI AI Service
- PostgreSQL
- Cloudinary / File Storage
- Veryfi OCR
- Grok AI
- GitHub Actions
- Vercel
- Render
- Neon PostgreSQL

Main arrows:

```text
Users / Roles -> Next.js Frontend
Next.js Frontend -> Express Backend API
Next.js Frontend -> FastAPI AI Service
Express Backend API -> PostgreSQL
FastAPI AI Service -> PostgreSQL
Express Backend API -> Cloudinary / File Storage
FastAPI AI Service -> Cloudinary / File Storage
FastAPI AI Service -> Veryfi OCR
FastAPI AI Service -> Grok AI
GitHub Actions -> Frontend / Backend / AI checks
Vercel -> Next.js Frontend
Render -> Express Backend API
Render -> FastAPI AI Service
Neon PostgreSQL -> PostgreSQL
```

Do not draw PostgreSQL connected directly to Cloudinary. Services talk to both.

## Diagram 2: Normal Product Request Flow

Use this diagram for normal restaurant operations such as orders, menu, inventory, purchases, expenses, and invoices.

Boxes:

- User
- Next.js Frontend
- Express Backend API
- RBAC Middleware
- Validation
- PostgreSQL
- Audit Log
- Notification Feed

Flow:

```text
User
  -> Next.js Frontend
  -> Express Backend API
  -> RBAC Middleware
  -> Validation
  -> PostgreSQL
  -> Audit Log
  -> Notification Feed
  -> Frontend refetch / toast
```

Use this explanation beside the diagram:

The Express backend verifies the JWT, checks the user's role, validates the payload, writes to PostgreSQL, and records an audit event. The frontend only controls the user experience; backend RBAC is the real security boundary.

## Diagram 3: AI Invoice Upload Flow

Use this diagram for image/PDF invoice upload and extraction.

Boxes:

- User
- Invoice AI Page
- FastAPI AI Service
- PostgreSQL
- Cloudinary / File Storage
- Redis/RQ Worker, optional
- FastAPI Background Task, fallback
- Veryfi OCR, optional
- Supplier Invoice
- Expense Record, optional

Flow:

```text
User
  -> Invoice AI Page
  -> FastAPI AI Service
  -> PostgreSQL import batch/import row
  -> Cloudinary / File Storage
  -> Queue or Background Task
  -> Fetch file from storage
  -> Veryfi OCR or stub extractor
  -> Normalize extracted data
  -> PostgreSQL extracted_data
  -> User review/correction
  -> User approval
  -> Supplier Invoice
  -> Expense Record, optional
```

Important note:

The actual file is stored in Cloudinary or local storage. PostgreSQL stores metadata and references. AI output stays staged until the user approves it.

## Diagram 4: Order WebSocket Flow

Use this diagram for realtime order updates.

Boxes:

- Waiter Session
- Chef Session
- Next.js Orders Page
- Next.js Dashboard Kitchen Queue
- Express Backend API
- PostgreSQL
- WebSocket `/ws`

Flow:

```text
Waiter creates order
  -> Frontend REST request
  -> Express Backend API
  -> PostgreSQL commit
  -> Express broadcasts compact order event on /ws
  -> Chef Orders/Dashboard receives event
  -> Chef frontend refetches REST data
```

Important note:

The WebSocket payload is not treated as final data. It is a signal to refetch. PostgreSQL remains the source of truth.

Fallback flow:

```text
WebSocket unavailable
  -> frontend silently polls every few seconds
  -> order screens still refresh
```

## Diagram 5: AI Recommendation Flow

Use this diagram for shortage prediction, reorder suggestion, pricing suggestion, prep time, and waste analysis.

Boxes:

- User
- AI Insights Page / Dashboard
- FastAPI AI Service
- PostgreSQL
- Grok AI
- Cached Insights

Flow:

```text
User requests recommendation
  -> Frontend
  -> FastAPI AI Service
  -> PostgreSQL reads current data
  -> FastAPI builds summary
  -> Grok AI returns JSON recommendation
  -> FastAPI saves cached insight, where applicable
  -> Frontend displays recommendation
```

Important note:

Recommendation endpoints are advisory. They do not automatically create orders, purchase orders, stock movements, or menu price changes.

## Diagram 6: CI/CD Flow

Use this diagram for development and deployment.

Boxes:

- Developer
- GitHub Repository
- GitHub Actions
- Frontend Build Job
- Backend Test Job
- AI Service Test Job
- Vercel
- Render Backend
- Render AI Service
- Neon PostgreSQL

Flow:

```text
Developer pushes to main
  -> GitHub Repository
  -> GitHub Actions
  -> Frontend build
  -> Backend tests with temporary PostgreSQL
  -> AI service pytest
  -> Vercel auto-deploys frontend
  -> Render auto-deploys backend and AI service
  -> Services connect to Neon PostgreSQL
```

Important note:

CI uses dummy/test secrets and temporary database services. It should not call paid AI, OCR, storage, or production database services.

## Role Placement

Do not draw six separate role boxes connected to six separate backend paths in the main architecture diagram. That makes the diagram too noisy.

Better structure:

```text
Users / Roles
(owner, manager, chef, waiter, cashier, store manager)
        -> Next.js Frontend
        -> Backend services enforce RBAC
```

Then explain role behavior in text or a small side table.

## Visual Rules

Keep each diagram focused on one story.

Good diagram titles:

- Overall System
- Normal Product Request Flow
- AI Invoice Upload Flow
- Order Realtime Flow
- AI Recommendation Flow
- CI/CD Flow

Avoid putting every feature, role, and endpoint into one diagram. A readable set of diagrams is better than one complete but unreadable diagram.
