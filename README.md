# RestaurantOS

RestaurantOS is a full-stack restaurant management app for restaurant operations, inventory, expenses, invoices, and AI-assisted invoice processing.

## Stack

- Frontend: Next.js
- Backend: Express.js
- AI service: FastAPI
- Database: PostgreSQL
- Local containers: Docker Compose

## Project Structure

```text
Frontend/      Next.js dashboard
Backend/       Express API, migrations, seeds, tests
ai-service/    FastAPI AI/OCR service and tests
Documentation/ Project docs and API reference
```

## Run Locally With Docker

Create a Docker env file:

```bash
cp .env.docker.example .env.docker
```

Start the full stack:

```bash
docker compose --env-file .env.docker up --build
```

Services:

```text
Frontend:   http://localhost:3000
Backend:    http://localhost:4000/api
AI service: http://localhost:8000
Postgres:   localhost:5432
```

The compose setup starts PostgreSQL, runs migrations and seeds once, then starts the backend, frontend, and AI service.

## Run Locally Without Full Compose

Start only PostgreSQL:

```bash
docker compose up -d postgres
```

Install dependencies:

```bash
npm install
cd ai-service
python -m pip install -r requirements.txt -r requirements-dev.txt
cd ..
```

Create a local `.env` from the example:

```bash
cp .env.example .env
```

Run migrations and seed data:

```bash
npm --prefix Backend run migrate
npm --prefix Backend run seed
```

Start the apps:

```bash
npm run dev:backend
npm run dev:frontend
cd ai-service
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Test Users

| Role | Email | Password |
|---|---|---|
| Owner | owner@restaurantos.test | Owner@123 |
| Manager | manager@restaurantos.test | Manager@123 |
| Chef | chef@restaurantos.test | Chef@123 |
| Waiter | waiter@restaurantos.test | Waiter@123 |
| Cashier | cashier@restaurantos.test | Cashier@123 |
| Store Manager | store@restaurantos.test | Store@123 |

## Tests

Frontend build:

```bash
npm --prefix Frontend run build
```

AI service tests:

```bash
cd ai-service
python -m pytest
```

Backend tests need a disposable PostgreSQL database:

```bash
$env:TEST_DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/restaurantos_test?sslmode=disable"
npm --prefix Backend test
```

GitHub Actions workflows are included for frontend, backend, and AI service, but they are currently not running because the payment account ID is blocked. The same checks can be run locally:

```bash
npm --prefix Frontend run build
npm --prefix Frontend run lint
```

```bash
cd ai-service
python -m pytest
```

```bash
$env:TEST_DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/restaurantos_test?sslmode=disable"
npm --prefix Backend test
```

## Documentation

- API reference: `Documentation/API.md`
- Normal product features: `Documentation/FEATURES.md`
- AI features: `Documentation/AI_FEATURES.md`
- Architecture notes: `Documentation/ARCHITECTURE.md`
- System diagram notes: `Documentation/SYSTEM_DIAGRAM.md`

## Notes

- `JWT_SECRET` must match between the Express backend and the AI service.
- AI provider keys are optional for local setup. Without them, the app still runs and invoice extraction can use the fallback path.
- PostHog analytics is optional. Set `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` to enable it.
- Dark/light mode is not delivered yet.
