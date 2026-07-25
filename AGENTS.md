# RestaurantOS Development Instructions

## Project Goal

Build RestaurantOS, an AI powered restaurant management platform, for the full stack developer technical assessment.

Hard deadline:
- Final submission deadline: Tuesday 9:00 AM.
- Internal completion target: Monday 11:00 PM at maximum.
- Treat Tuesday morning as buffer only for final checks, deployment verification, README cleanup, and submission packaging.

Available sample invoices:
- `Documentation/invoices/invoices`
- Use these files for AI invoice upload, OCR extraction, invoice display, and expense register export testing.

## Delivery Strategy

Do not try to build every possible feature with equal depth. Build the required product surface first, then AI, then bonus items. A working, reviewable app beats a wide but broken app.

Priority order:
1. Basic/core requirements
2. AI features
3. Bonus/additional features
4. Submission assets

## Phase 1: Basic/Core Requirements

This phase must be completed first.

Authentication:
- Secure login
- Password hashing
- JWT or secure session based auth
- Role based authentication and authorization

Roles:
- Owner
- Manager
- Chef
- Waiter
- Cashier
- Store Manager, optional

Core CRUD modules:
- Table Management
- Order Management
- Menu Management
- Recipe Management
- Ingredient Management
- Supplier Management
- Staff Management
- Product Management
- Category Management
- Warehouse / Store Management
- Stock In / Stock Out
- Purchase Orders
- Expense Categories
- Expense Records
- Supplier Invoice Management
- Monthly Expense Tracking

Dashboard:
- Sales Overview
- Active Orders
- Table Occupancy
- Low Stock Items
- Monthly Expenses
- Purchase Summary
- Profit Overview
- Supplier Summary

Minimum quality bar:
- All core routes should exist in frontend and backend.
- CRUD pages must be usable, not just static placeholders.
- RBAC must block unauthorized access on the backend, not only hide buttons in the UI.
- PostgreSQL must be the source of truth.
- Use migrations for schema and seed files for demo data.

## Phase 2: AI Features

Implement after the core product works.

FastAPI owns AI/OCR work. Express owns product rules, auth, RBAC, validation, and PostgreSQL writes.

AI capabilities:
- Predict ingredient shortages
- Recommend stock reorder quantities
- Suggest menu pricing
- Estimate food preparation time
- Analyze ingredient waste and provide recommendations

AI invoice processing:
- Upload one or more supplier invoices
- Support PDFs and images
- Process printed and handwritten invoices
- Extract invoice information using AI/OCR
- Store extracted data in PostgreSQL
- Generate an Expense Register in Excel
- Display extracted information in the application

Implementation rule:
- Frontend uploads to Express.
- Express checks auth/RBAC and stores upload metadata.
- Express sends the file or file reference to FastAPI.
- FastAPI extracts structured invoice data.
- Express validates the extracted result and writes it to PostgreSQL.

## Phase 3: Bonus Features

Only start this phase after Phase 1 is usable and Phase 2 has at least the invoice workflow working.

Bonus candidates:
- Live deployed demo
- Public GitHub repository with clean commit history
- Docker / Docker Compose
- API documentation
- Unit tests
- WebSocket implementation
- Notifications
- Activity logs / audit trail
- Dashboard charts
- CSV / Excel import and export
- File uploads
- Search and filtering
- Dark mode
- CI/CD pipeline configuration

Recommended bonus priority:
1. Live demo
2. Docker Compose
3. API documentation
4. Dashboard charts
5. Search and filtering
6. Excel export
7. Activity logs
8. Minimal tests for auth, RBAC, and critical inventory/order paths

Do not add WebSockets unless the core app and AI invoice flow are already stable.

## Phase 4: Submission

Submission must include:
- GitHub repository
- Live application URL, if deployed
- README with setup instructions
- Additional documentation that helps reviewers understand architecture and tradeoffs

README must include:
- Tech stack
- Local setup
- Env variables
- Database setup
- Migration and seed commands
- Test user credentials
- Feature list
- AI invoice processing explanation
- Known limitations
- Deployment notes

## Design Requirements

The UI must feel modern, interactive, and product-like. It should not look like generic AI generated output.

Design rules:
- Build the actual application first, not a marketing landing page.
- Use a dashboard layout with clear navigation.
- Use charts and analytics where they improve the experience.
- Keep screens dense enough for restaurant operations work.
- Avoid generic gradient-heavy hero sections.
- Avoid one-note color palettes.
- Use consistent spacing, typography, empty states, loading states, and error states.
- UI text must fit containers on desktop and mobile.
- Tables, forms, filters, and action buttons must be easy to scan and use.

Important pages:
- Login
- Dashboard overview
- Orders
- Tables
- Menu
- Recipes
- Ingredients
- Suppliers
- Staff
- Inventory
- Purchases
- Expenses
- Invoices
- Invoice upload and review

## Code Requirements

Code must be clean, scalable, and easy to read.

Rules:
- Use PostgreSQL.
- Use migration files for database schema.
- Use seed files for repeatable demo data.
- Keep local random data disposable.
- Keep Neon/demo data clean and seeded.
- Use FastAPI only for AI/OCR features.
- Keep Express as the main product API.
- Do not put AI/OCR logic directly into the Express backend.
- Do not add abstractions before they are useful.
- Do not create large files; if a file crosses roughly 300 to 400 lines, split it deliberately.
- Add comments only where they explain non-obvious business logic or failure handling.
- Do not add noisy comments that restate the code.
- Do not use em dashes in comments.
- Avoid unrelated refactors.
- Backend validation and authorization must be enforced server-side.
- Frontend permissions are UX only, not security.

## Data Rules

Migrations define structure:
- Tables
- Columns
- Indexes
- Constraints
- Enums
- Relationships

Seeds define demo data:
- Users and staff roles
- Restaurant profile
- Tables
- Menu categories and menu items
- Ingredients
- Recipes
- Suppliers
- Inventory products and categories
- Warehouse/store records
- Starting stock
- Expense categories
- Sample purchase orders
- Sample supplier invoices
- Sample orders

Do not rely on manually entered local data for the final demo. Neon should be populated by the same seed command used locally.

## Deployment Direction

Use this default direction unless requirements change:
- Local database: Docker PostgreSQL
- Hosted database: Neon PostgreSQL
- Frontend hosting: Vercel or another simple Next.js host
- Backend hosting: Render, Railway, or similar Node hosting
- AI service hosting: Render, Railway, or similar Python/FastAPI hosting

Docker support:
- Keep Docker Compose for local PostgreSQL from the beginning.
- Add app Dockerfiles after app start commands, migrations, file upload paths, and AI dependencies stabilize.

## Execution Discipline

Work systematically:
1. Finish data model and migrations.
2. Add seed data.
3. Implement auth and RBAC.
4. Implement core backend CRUD.
5. Implement frontend CRUD pages.
6. Implement dashboard analytics.
7. Implement AI invoice workflow.
8. Add remaining AI recommendations.
9. Add selected bonus features.
10. Finalize docs, deployment, and submission.

At every phase:
- Keep the app runnable.
- Validate before moving on.
- Prefer small commits with clear messages.
- Do not leave broken placeholder code on routes that reviewers will click.

