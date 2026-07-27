# AI Features

This file explains the AI parts of RestaurantOS in plain language. The API route list is in `Documentation/API.md`.

## Service Boundary

RestaurantOS keeps normal product rules in the Express backend and AI/OCR work in the FastAPI service.

Express owns:

- authentication and RBAC for product workflows
- normal CRUD rules
- final PostgreSQL writes for restaurant data
- validation before data becomes part of the main system

FastAPI owns:

- invoice extraction
- AI recommendations
- OCR normalization
- background processing for invoice imports

This split keeps AI output from directly changing important business records without review.

## Shared Authentication

The AI service verifies the same JWT used by the Express backend. That means users do not log in again for AI features.

The `JWT_SECRET` must match in both services. If the secrets differ, the AI service rejects the frontend request even if the user is logged in.

## AI Invoice Upload

The invoice upload flow is built for review, not blind automation.

Flow:

1. User uploads one or more invoice files from the frontend.
2. The AI service stores an import row with status such as `queued`, `processing`, `extracted`, `failed`, `approved`, or `rejected`.
3. The AI service extracts structured fields from the file.
4. The frontend polls the import list/detail endpoint to show progress.
5. The user reviews and corrects the extracted data.
6. The user approves the import.
7. Approval creates a real supplier invoice in PostgreSQL.

Until approval, extracted invoice data is treated as staging data.

## Supported Invoice Files

The AI invoice upload accepts common invoice formats:

- PDF
- PNG
- JPEG
- WebP

Each file is validated for type and size before processing.

## OCR Provider and Fallback

When Veryfi credentials are configured, the AI service sends the invoice file to Veryfi and maps the response into the app's invoice shape.

When Veryfi is not configured, the service uses a clearly marked stub extraction. This keeps the demo workflow usable without paid OCR credentials, but the result must be reviewed before approval.

The fallback exists for local development and assessment demos. It is not a replacement for real OCR in production.

## Invoice Extraction Status

Invoice imports use statuses so the UI can show progress clearly.

| Status | Meaning |
|---|---|
| uploaded | row was created before file storage finished |
| queued | file is stored and waiting for processing |
| processing | worker/background task is extracting data |
| extracted | fields were extracted and are ready for review |
| failed | extraction failed and the error is stored |
| approved | user approved the extraction and created a supplier invoice |
| rejected | user rejected the extraction |

The frontend uses polling for this flow because invoice processing is a background job. WebSockets are not needed here.

## Queue Behavior

The AI service supports two processing modes:

- Redis/RQ queue mode
- inline FastAPI background task mode

If Redis is reachable, the service can enqueue invoice jobs for an RQ worker. This is better for production because processing is separated from API requests.

If Redis is not configured, the service falls back to FastAPI background tasks. This is simpler for local setup and demos.

If Redis is configured but no RQ worker is running, imports can remain stuck in `queued`. In that case, either start an RQ worker or remove `REDIS_URL` so inline processing is used.

## Supplier Matching

After extraction, the AI service tries to match the extracted supplier name to an existing supplier.

The match is only a suggestion. The user can still choose or correct the supplier before approval.

## Approval Flow

Approval is the point where staged AI data becomes real business data.

On approval, the system can:

- create a supplier invoice
- create invoice line items
- link the invoice to a supplier
- optionally create an expense record

This step validates required fields such as supplier and invoice number. Duplicate supplier invoices are blocked.

## Expense Register Export

The AI service can generate an Excel expense register from invoice data.

This is useful after AI invoice processing because approved supplier invoices can be reviewed and exported in a spreadsheet-friendly format.

## Shortage Prediction

The shortage prediction feature looks at ingredient stock, reorder levels, and recent usage. It asks the AI model to identify ingredients that may reach reorder level or run out within the selected horizon.

The AI response is based on numbers supplied by PostgreSQL. The model is not allowed to invent ingredients or stock values.

## Reorder Suggestions

The reorder feature suggests quantities to buy for ingredients, products, or both.

It uses current stock, reorder levels, and recent consumption or movement history. The goal is to help the manager or store manager decide what to order next.

The recommendation is advisory. It does not create a purchase order automatically.

## Menu Pricing Suggestions

The pricing feature looks at menu item cost, current price, recipe cost, sales popularity, and a target margin.

It suggests prices that move toward the target margin while still considering demand. The output is a recommendation only. A manager must update the actual menu price manually.

## Prep Time Estimate

The prep-time feature estimates how long menu items may take to prepare.

It uses recipe and menu context, then returns estimates for kitchen planning. The result can help chefs and managers understand preparation pressure, but it does not change order status automatically.

## Waste Analysis

The waste analysis feature reviews waste-related stock movement and inventory data.

It returns likely waste patterns and recommendations. This helps managers and store managers decide where to reduce loss.

## Cached AI Insights

Some AI results can be saved as cached insights. The dashboard reads cached insights instead of calling the model every time the page loads.

This keeps the dashboard faster and avoids unnecessary model calls.

## Network and Paid Service Safety

Automated AI service tests do not call Grok, Veryfi, Cloudinary, Redis, or Neon.

Tests use mocks for provider calls and database boundaries. This keeps CI safe, repeatable, and free from paid external API usage.

## Current Limitations

- AI recommendations depend on the quality of existing restaurant data.
- OCR output must be reviewed before approval.
- Inline background processing is simpler but less durable than a dedicated worker.
- Redis/RQ needs a real worker process if enabled.
- AI features are advisory unless a user approves or applies the result.
