# Future Enhancements

This file lists improvements that are intentionally left as future hardening work. The current application covers the assessment scope, but these items would matter before treating the system as production-grade.

## API Idempotency

Current status: not implemented as a shared API pattern.

Several backend flows use database transactions, row locks, atomic updates, and unique constraints. That helps with some concurrent operations, but it does not make repeated client requests safe.

Future work:

- Add an `Idempotency-Key` header for important mutation endpoints.
- Store keys in an `idempotency_keys` table with user, method, path, request hash, response body, status code, and timestamps.
- Return the stored response when the same user retries the same request with the same key.
- Return `409 Conflict` if the same key is reused with a different request body.
- Apply this first to order creation, payment capture, stock movement, purchase receiving, invoice import, and invoice-to-expense generation.

Why this matters:

- Browser retries, mobile network drops, and double-clicks can submit the same action twice.
- Without idempotency, duplicate orders, duplicate stock changes, duplicate payment side effects, or duplicate audit entries can happen.

## Stronger Concurrency Controls

Current status: partially implemented.

Some flows already protect shared rows. Product stock movements lock the product row before changing stock. Purchase order receiving locks the purchase order row. Ingredient stock adjustments use an atomic conditional update to avoid negative stock.

Future work:

- Lock order rows during payment, status changes, and item edits.
- Add a database-level unique constraint for one generated expense per supplier invoice.
- Review invoice status transitions for concurrent requests.
- Add concurrent request tests for order payment, stock movement, purchase receiving, and invoice expense generation.

Why this matters:

- Transactions keep each individual operation atomic.
- Row locks and constraints are still needed when two valid requests touch the same business record at the same time.

## Audit And Notification Hardening

Current status: implemented for core visibility, but not fully deduplicated.

Future work:

- Tie audit and notification records to idempotency keys where possible.
- Prevent duplicate notifications from retried requests.
- Add more role-specific notification rules as the product grows.
- Add tests for notification visibility by role and actor.

Why this matters:

- Live systems can create noisy audit trails if retries are logged as separate business actions.
- Restaurant staff should only see notifications that are relevant to their role and action context.

## Production Observability

Current status: basic logs and analytics are available.

Future work:

- Add structured backend logs with request IDs.
- Add error tracking for frontend, Express backend, and FastAPI service.
- Add service health dashboards for database, AI service, and invoice queue processing.
- Track slow endpoints and failed AI invoice imports.

Why this matters:

- A deployed restaurant operations tool needs quick failure diagnosis.
- AI invoice processing can fail because of file quality, third-party OCR issues, service downtime, or malformed extraction results.

## Broader Automated Testing

Current status: CI workflows and service-level tests exist.

Future work:

- Add true concurrent request tests for critical stock and order flows.
- Add frontend component tests for high-risk forms.
- Add end-to-end tests for login, order creation, invoice upload, and expense export.
- Add contract tests between frontend, Express, and FastAPI response shapes.

Why this matters:

- Unit tests catch isolated logic issues.
- End-to-end and concurrency tests catch the failures most likely to affect real restaurant workflows.

## Data And Deployment Hardening

Current status: migrations, seeds, Docker-based local setup, and hosted deployment support exist.

Future work:

- Add backup and restore documentation for PostgreSQL.
- Add database migration rollback notes.
- Add rate limiting on login and expensive AI endpoints.
- Add file retention rules for uploaded invoice files.
- Add stricter environment validation at service startup.

Why this matters:

- Production systems fail in operational ways, not only code-level ways.
- Data recovery, rate limits, and startup validation reduce avoidable downtime.

