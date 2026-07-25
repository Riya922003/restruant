# Phase 1 — Spec 11: Frontend Foundation

> The shared frontend shell and infrastructure: auth flow, typed API client,
> design system, and shared UI components that every module page (spec `12`)
> builds on. Depends on the API contract in specs `00` (envelope, pagination),
> `03` (login/`/me`/logout, JWT Bearer), `04` (role matrix, UX-only gating), and
> `05` (`{ data, meta }` success + `{ message, errors }` error envelopes).
>
> **Next.js-version caveat:** the frontend is pinned to Next.js `16.2.11`, which
> `Frontend/AGENTS.md` warns has breaking changes vs. training data. **Before
> writing any frontend code, read the relevant guide in
> `Frontend/node_modules/next/dist/docs/`** (App Router, `middleware`, `metadata`,
> `cookies`/`headers`, `redirect`, route handlers). Do **not** assume APIs from
> older Next.js versions. Verify every framework API (middleware signature,
> `cookies()`/`headers()` async-vs-sync behavior, `redirect`, Server/Client
> component rules) against the installed docs and heed deprecation notices.

## 1. Tech stack & constraints

| Concern        | Choice (pinned)                                            |
|----------------|-----------------------------------------------------------|
| Framework      | Next.js `16.2.11`, **App Router** (`Frontend/app/`)       |
| UI runtime     | React `19.2.4`                                             |
| Language       | TypeScript `^5` (strict)                                   |
| Styling        | Tailwind CSS `^4` (CSS-first `@theme`, no `tailwind.config.js` unless docs require) |
| API base URL   | `process.env.NEXT_PUBLIC_API_URL` (`http://localhost:4000/api`) |

Hard rules (from `AGENTS.md` and spec `00`):

- **Read `node_modules/next/dist/docs/` first.** Do not guess framework APIs.
- Files stay under ~300–400 lines. Split components/hooks/utilities deliberately.
- Frontend permissions are **UX only**; the backend enforces security (spec `04`).
- Every data view implements **loading, empty, and error** states (see §9).
- No em dashes in code comments; comment only non-obvious logic.
- No marketing/gradient hero pages; build the dense product UI (see §6).

### 1.1 Server vs. Client components

- App Router defaults to **Server Components**. Keep purely static/presentational
  wrappers (root layout, metadata) as server components.
- Mark files `'use client'` when they use state, effects, event handlers, browser
  APIs, or the auth/API-client (which read `localStorage` / React context). That
  covers: the auth provider, every interactive page, and most shared UI in §7.
- **Phase 1 keeps it simple:** the API client runs in the browser (client
  components fetch on mount). Do not build a server-side data layer, RSC data
  fetching, or server actions in Phase 1 unless the installed docs make it clearly
  simpler. Revisit in a later phase.
- Verify the exact directive placement and any Next 16 nuances (e.g. async
  `cookies()`/`headers()`, `params`/`searchParams` being promises) against the
  installed docs before relying on them.

## 2. Directory structure to add under `Frontend/`

Add the following. Keep each file focused and under the size limit; split when a
file grows (e.g. `components/ui/data-table/` becomes a folder).

```
Frontend/
  app/
    layout.tsx                 # exists — wrap children with <AuthProvider> + <ToastProvider>
    globals.css                # design tokens via Tailwind v4 @theme (see §6)
    page.tsx                   # exists — root; redirect to /dashboard or /login
    login/page.tsx             # exists — implement login form (§3)
    dashboard/
      layout.tsx               # exists — replace nav with role-filtered AppShell (§5, §7)
      page.tsx                 # overview
      orders/ tables/ menu/ inventory/ purchases/
      expenses/ invoices/ suppliers/ staff/      # one page.tsx each (spec 12)
  lib/
    api-client.ts              # typed fetch wrapper (§4)
    auth.ts                    # token storage + AuthContext/useAuth (§3)
    permissions.ts             # canAccess() + nav filtering (§5), mirrors spec 04
    types.ts                   # shared API resource types + envelopes (§4.1)
    format.ts                  # money/date/enum-label formatters
  components/
    ui/                        # design-system primitives (§7): button, input, modal, ...
    layout/                    # AppShell, Sidebar, Topbar, MobileNav
  hooks/
    use-api.ts                 # fetch-on-mount hook returning {data, meta, isLoading, error} (§8)
    use-toast.ts               # toast dispatch
    use-debounce.ts            # for SearchInput / FilterBar
middleware.ts                  # OPTIONAL route guard at project root — verify API vs docs (§3.4)
```

> `lib/types.ts` may be split (e.g. `types/orders.ts`) once it grows. Resource
> types mirror backend **snake_case** fields (spec `05` §6: no camelCase transform
> layer). Money/quantity are numbers in JSON (spec `05` §6).

## 3. Auth flow

Backend contract (spec `03`): `POST /api/auth/login` → `{ data: { token, user } }`;
`GET /api/auth/me` → `{ data: <user> }`; `POST /api/auth/logout` → `{ data: { success } }`.
User shape: `{ id, full_name, email, role, is_active }`. Token is a `HS256` JWT,
`12h` expiry, sent as `Authorization: Bearer <token>`.

### 3.1 Token storage decision

**Recommended: `httpOnly` cookie if feasible with this Next.js version.** An
`httpOnly`, `Secure`, `SameSite=Lax` cookie is not readable by JS and mitigates
XSS token theft. Because the backend accepts the `Authorization` header regardless
of frontend storage (spec `03` §5), a cookie approach needs a thin server hop
(Next route handler / server action) to read the cookie and forward it as a Bearer
header, or the client reads a non-`httpOnly` companion. **Verify the Next 16
`cookies()` API (it may be async) in the installed docs before committing to this.**

**Fallback (acceptable for Phase 1): in-memory + `localStorage`.** Hold the token
in a module-level variable for the session and mirror it to `localStorage` so a
refresh re-hydrates. Simpler and header-based end to end.

> **Known limitation (document in README):** `localStorage` tokens are readable by
> injected scripts, so they carry an **XSS risk**. Mitigations: strict input
> escaping (React does this by default), no `dangerouslySetInnerHTML` on user data,
> `12h` token expiry, and logout-on-401. If cookie storage is adopted, this risk is
> reduced. Pick one strategy and apply it consistently across `lib/auth.ts` and
> `lib/api-client.ts`.

```ts
// lib/auth.ts — token accessors (localStorage fallback shown)
const TOKEN_KEY = "restaurantos.token";
let inMemoryToken: string | null = null;

export function setToken(token: string | null): void {
  inMemoryToken = token;
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  if (typeof window === "undefined") return null;
  inMemoryToken = localStorage.getItem(TOKEN_KEY);
  return inMemoryToken;
}
```

### 3.2 Auth context / provider

`lib/auth.ts` exports an `AuthProvider` (client component) and `useAuth()` hook.
Mount `<AuthProvider>` in `app/layout.tsx` so the whole tree can read it.

```ts
export type User = {
  id: number;
  full_name: string;
  email: string;
  role: "owner" | "manager" | "chef" | "waiter" | "cashier" | "store_manager";
  is_active: boolean;
};

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;                 // true while hydrating /me on first load
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): AuthContextValue;
```

Provider behavior:

- **On mount:** if a token exists, call `GET /api/auth/me` to hydrate `user`; set
  `isLoading=false` when resolved. If `/me` returns 401, clear the token and leave
  `user=null`.
- **`login(email, password)`:** POST `/api/auth/login`, store the returned token,
  set `user` from the response, then redirect to `/dashboard`.
- **`logout()`:** call `POST /api/auth/logout` (best-effort), clear the token and
  in-memory user, redirect to `/login`.

### 3.3 Login page (`app/login/page.tsx`)

- `'use client'`. A centered card (not a marketing hero) with email + password
  fields (shared `Input`), a submit `Button`, and inline error display for `401
  Invalid credentials` (uniform message per spec `03` §8).
- On submit call `useAuth().login(...)`; show `LoadingState` on the button while
  pending; on `ApiError` show the message in an `ErrorState`/inline alert.
- If already authenticated, redirect to `/dashboard`.

### 3.4 Route protection

Protect all `/dashboard/*` routes; redirect unauthenticated users to `/login`.
Implement a **client guard** and optionally reinforce with **middleware**.

**Client guard (primary, always implement):** in `app/dashboard/layout.tsx` (or a
small `<RequireAuth>` wrapper), read `useAuth()`. While `isLoading`, render a
full-page `LoadingState`. If `!isLoading && !user`, call the Next.js `redirect`/
router push to `/login`. Only render the shell + children when `user` is present.

**Middleware (optional reinforcement):** a project-root `middleware.ts` can check
for the auth cookie and redirect to `/login` before the page renders (avoids a
flash of protected UI). This only works cleanly with the **cookie** storage
strategy (§3.1); `localStorage` is not visible to middleware.

> **Verify the middleware API against the installed Next 16 docs** (the `config.matcher`
> shape, the `NextRequest`/`NextResponse` signatures, and edge-runtime constraints
> may differ from training data). Do not copy a middleware snippet from memory.

```ts
// middleware.ts — SHAPE ONLY; confirm every symbol against node_modules/next/dist/docs/
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("restaurantos.token")?.value;
  if (!token && req.nextUrl.pathname.startsWith("/dashboard")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/dashboard/:path*"] };
```

## 4. API client (`lib/api-client.ts`)

A typed `fetch` wrapper used by every page/hook. Responsibilities:

- Prefix requests with `NEXT_PUBLIC_API_URL`.
- Inject `Authorization: Bearer <getToken()>` when a token exists; set
  `Content-Type: application/json` on JSON bodies.
- Parse the success envelope `{ data, meta }` and return `{ data, meta }`.
- On non-2xx, parse `{ message, errors }` and **throw a typed `ApiError`**.
- On **401**, clear the session (token + user) and redirect to `/login`.
- Serialize query params for pagination/sort/filter (`page`, `limit`, `sort`,
  plus module filters like `status`, `search`, `supplier_id`) — omit
  `undefined`/empty values.

### 4.1 Types & signatures (sketch)

```ts
// lib/types.ts
export interface ApiMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface ApiSuccess<T> { data: T; meta?: ApiMeta; }
export interface ApiErrorBody {
  message: string;
  errors?: { field: string; message: string }[]; // present on 422 (spec 05 §3)
}

export class ApiError extends Error {
  status: number;
  errors?: { field: string; message: string }[];
  constructor(status: number, message: string, errors?: ApiError["errors"]) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;
```

```ts
// lib/api-client.ts
interface RequestOptions {
  params?: QueryParams;        // -> querystring (skips undefined/null/"")
  body?: unknown;              // JSON.stringify'd
  signal?: AbortSignal;
}

export const api = {
  get:   <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, opts),
  post:  <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("POST", path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PATCH", path, { ...opts, body }),
  put:   <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PUT", path, { ...opts, body }),
  delete:<T>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, opts),
};

// Returns the full envelope so callers can read meta for pagination.
async function request<T>(
  method: string,
  path: string,
  opts?: RequestOptions
): Promise<ApiSuccess<T>> {
  // 1. build URL from NEXT_PUBLIC_API_URL + path + serialized opts.params
  // 2. headers: Authorization (if token), Content-Type for JSON body
  // 3. fetch; if res.ok -> return parsed { data, meta }
  // 4. if 401 -> clearSession(); redirect /login; throw ApiError(401, ...)
  // 5. else parse { message, errors } -> throw new ApiError(status, message, errors)
  // 6. network/parse failure -> throw ApiError(0, "Network error")
}
```

- `errors[]` from 422 lets forms map messages to fields (see `FormField`, §7).
- Keep the client transport-only; no business logic. Modules call
  `api.get<Order[]>("/orders", { params })`, etc.

## 5. Role-based UI gating

Read `user.role` from `useAuth()` and gate nav items and action buttons. This is
**UX only** — the backend still returns `403` for anything not permitted (spec
`04`). Never treat hidden UI as a security boundary.

`lib/permissions.ts` mirrors the spec `04` matrix as data:

```ts
import type { User } from "./auth";
type Role = User["role"];
type Action = "read" | "create" | "update" | "delete";

// Mirror of spec 04 §3. owner has full access (bypass).
const MATRIX: Record<string, Partial<Record<Role, Action[]>>> = {
  staff:      { manager: ["read", "create", "update", "delete"] },
  tables:     { manager: ["read","create","update","delete"], chef: ["read"],
                waiter: ["read","update"], cashier: ["read"] },
  orders:     { manager: ["read","create","update","delete"], chef: ["read","update"],
                waiter: ["read","create","update"], cashier: ["read","update"] },
  suppliers:  { manager: ["read","create","update","delete"], store_manager: ["read","create","update","delete"] },
  // ... one entry per resource row in spec 04 §3 ...
};

export function canAccess(role: Role, resource: string, action: Action = "read"): boolean {
  if (role === "owner") return true;                 // owner bypass (spec 04 §2.1)
  return MATRIX[resource]?.[role]?.includes(action) ?? false;
}
```

Nav filtering in `dashboard/layout.tsx` — each nav entry declares the resource it
reads; filter the array by `canAccess(user.role, resource, "read")`:

```ts
const NAV = [
  { label: "Overview",  href: "/dashboard",           resource: "dashboard" },
  { label: "Orders",    href: "/dashboard/orders",    resource: "orders" },
  { label: "Tables",    href: "/dashboard/tables",    resource: "tables" },
  { label: "Menu",      href: "/dashboard/menu",       resource: "menu_items" },
  { label: "Inventory", href: "/dashboard/inventory", resource: "products" },
  { label: "Purchases", href: "/dashboard/purchases", resource: "purchase_orders" },
  { label: "Expenses",  href: "/dashboard/expenses",  resource: "expense_records" },
  { label: "Invoices",  href: "/dashboard/invoices",  resource: "supplier_invoices" },
  { label: "Suppliers", href: "/dashboard/suppliers", resource: "suppliers" },
  { label: "Staff",     href: "/dashboard/staff",      resource: "staff" },
] as const;

const visibleNav = NAV.filter((n) => canAccess(user.role, n.resource, "read"));
```

- Hide **action buttons** (Create/Edit/Delete) the role cannot use, e.g.
  `{canAccess(role, "products", "create") && <Button>New product</Button>}`.
- If a role deep-links to a page it cannot read, the page shows an `ErrorState`
  ("You do not have access") after the API returns `403`. UI gating only reduces
  friction; the API is the gate.

## 6. Design system

Per `AGENTS.md` Design Requirements: modern, interactive, **dense, product-like**;
**not** a marketing/gradient landing page; **not** a one-note palette; **not**
generic AI output. Consistent spacing, typography, empty/loading/error states.
Text must fit containers on desktop **and** mobile.

Tailwind v4 uses **CSS-first configuration**: declare tokens in `app/globals.css`
inside an `@theme { ... }` block (CSS custom properties), which generates utility
classes. Confirm the exact `@theme`/`@import "tailwindcss"` syntax for the
installed Tailwind v4 version before relying on it.

```css
/* app/globals.css (sketch — verify Tailwind v4 syntax) */
@import "tailwindcss";

@theme {
  /* Neutral base: zinc (already used in scaffolding) */
  --color-bg:            var(--color-zinc-50);
  --color-surface:       #ffffff;
  --color-border:        var(--color-zinc-200);
  --color-text:          var(--color-zinc-900);
  --color-text-muted:    var(--color-zinc-500);

  /* Primary brand accent (a real second tone, not one-note) */
  --color-primary:       #4f46e5;   /* indigo-600 */
  --color-primary-hover: #4338ca;   /* indigo-700 */
  --color-primary-fg:    #ffffff;

  /* Semantic colors */
  --color-success:       #16a34a;   /* green-600  */
  --color-warning:       #d97706;   /* amber-600  */
  --color-danger:        #dc2626;   /* red-600    */
  --color-info:          #0891b2;   /* cyan-600   */

  /* Radius / shadow tokens */
  --radius-sm: 0.25rem; --radius-md: 0.5rem; --radius-lg: 0.75rem;
  --shadow-card: 0 1px 2px rgb(0 0 0 / 0.05), 0 1px 3px rgb(0 0 0 / 0.08);
  --shadow-overlay: 0 10px 25px rgb(0 0 0 / 0.15);
}
```

**Palette** — neutral zinc base (already in scaffolding) + an indigo primary accent
+ four semantics. Each has a hover/subtle background variant (e.g. `success` text
on a `green-50` pill). Do not rely on a single hue for everything.

**Typography scale** (Tailwind classes):

| Token        | Size / weight        | Use                                  |
|--------------|----------------------|--------------------------------------|
| Display      | `text-2xl font-semibold` | Page titles                       |
| Heading      | `text-lg font-semibold`  | Section / card headers            |
| Body         | `text-sm`                | Default UI text, table cells      |
| Body-strong  | `text-sm font-medium`    | Labels, emphasized cells          |
| Caption      | `text-xs text-zinc-500`  | Meta, timestamps, helper text     |

Base UI runs at `text-sm` (14px) to stay **dense** for operations work.

**Spacing scale:** use Tailwind's 4px step. Conventions: card padding `p-4`/`p-6`,
form field gap `gap-4`, table cell padding `px-3 py-2`, section gap `gap-6`,
page gutter `px-4 sm:px-6 lg:px-8`.

**Border / radius / shadow tokens:** 1px `border-zinc-200`; radius `rounded-md`
for controls, `rounded-lg` for cards/modals; `shadow-card` for cards, heavier
overlay shadow for modals/drawers.

**Responsiveness (text must fit):**

- Mobile-first; layout scales up at `sm`/`md`/`lg`.
- Prevent overflow: `truncate`/`min-w-0` on flex children, `break-words` on long
  fields (emails, addresses), and wrap long table columns or make the table
  horizontally scrollable (`overflow-x-auto`) rather than clipping text.
- Never fix a width that clips label text; test the longest seeded values.

## 7. Shared UI components (`components/ui/`, `components/layout/`)

Each is small, typed, styled with the tokens above. Purpose + key props:

### Layout (`components/layout/`)

- **AppShell** — page frame composing Sidebar + Topbar + main content area.
  Props: `{ children }`. Used by `dashboard/layout.tsx`.
- **Sidebar** — vertical nav; receives the role-filtered nav (§5), highlights the
  active route, collapses on mobile. Props: `{ items, currentPath, onNavigate? }`.
- **Topbar** — app name, current user (name + role badge), logout button, mobile
  hamburger toggle. Props: `{ user, onLogout, onToggleNav }`.
- **MobileNav** — off-canvas drawer version of the sidebar for small screens.
  Props: `{ items, open, onClose, currentPath }`.

### Primitives (`components/ui/`)

- **Button** — actions. Props: `{ variant: "primary"|"secondary"|"ghost"|"danger",
  size?: "sm"|"md", isLoading?, disabled?, leftIcon?, ...buttonProps }`.
- **Input / Textarea** — text entry. Props: `{ label?, error?, hint?, ...fieldProps }`.
- **Select** — dropdown. Props: `{ label?, error?, options: {label,value}[], ...}`.
- **Checkbox** — boolean. Props: `{ label, checked, onChange }`.
- **DatePicker** — date entry (native `<input type="date">` acceptable in Phase 1).
  Props: `{ label?, value, onChange, error? }`.
- **FormField** — wraps a control with label + error text; maps `ApiError.errors[]`
  (422) to the matching field. Props: `{ label, error?, htmlFor, children }`.
- **Badge / StatusPill** — maps enum values to semantic colors. Props:
  `{ kind: "order_status"|"table_status"|"invoice_status"|"payment_status"|...,
  value: string }`. Internally a per-enum map (e.g. order `preparing`→warning,
  `ready`→info, `served`/`completed`→success, `cancelled`→danger; table
  `available`→success, `occupied`→warning, `reserved`→info).
- **Card / StatCard** — dashboard blocks. `Card`: `{ title?, actions?, children }`.
  `StatCard`: `{ label, value, delta?, icon?, tone? }` for the 8 dashboard widgets.
- **DataTable** — sortable, paginated table driven by column defs. Props:
  `{ columns: Column<T>[], rows: T[], sort?, onSortChange?, isLoading?, emptyLabel?,
  rowKey: (r:T)=>string|number, onRowClick? }` where
  `Column<T> = { key, header, sortable?, render?: (row:T)=>ReactNode, className? }`.
  Renders `LoadingState` (skeleton rows) when `isLoading`, `EmptyState` when no
  rows; wrap in `overflow-x-auto` for mobile.
- **Pagination** — page control bound to `meta`. Props:
  `{ page, totalPages, total, onPageChange }`.
- **Modal / Dialog** — centered overlay. Props: `{ open, onClose, title, children,
  footer? }`. Focus-trapped, closes on Esc/backdrop.
- **Drawer / SlideOver** — right-side panel for create/edit forms. Props:
  `{ open, onClose, title, children, footer? }`.
- **ConfirmDialog** — destructive-action confirmation. Props:
  `{ open, title, message, confirmLabel?, tone?: "danger", onConfirm, onCancel }`.
- **Toast / notification** — transient feedback via `useToast()`. API:
  `toast.success(msg) | toast.error(msg) | toast.info(msg)`; provider mounted in
  root layout. Wire API mutations to toast success/failure.
- **SearchInput** — debounced text filter. Props: `{ value, onChange, placeholder? }`.
- **FilterBar** — row of filter controls above a table. Props:
  `{ children, onReset? }` (compose `Select`/`SearchInput`/`DatePicker`).
- **EmptyState** — no-data view. Props: `{ title, description?, action? }`.
- **LoadingState** — spinner or skeletons. Props: `{ variant?: "spinner"|"skeleton",
  rows?, label? }`.
- **ErrorState** — failure view with retry. Props: `{ title?, message, onRetry? }`;
  reads `ApiError.message`; renders access-denied copy for `403`.

## 8. Data fetching & state

**Phase 1 approach: plain `fetch` via the `api` client inside client components,
using a small `useApi` hook (`useEffect` + state).** Chosen over TanStack Query to
keep dependencies minimal (spec `00` §4: do not add dependencies without a reason)
and because Phase 1 lists are simple paginated CRUD. TanStack Query is an
acceptable optional upgrade if caching/refetch complexity grows, but is **not
required**; if added, wrap the app in its provider and keep the `api` client as the
transport.

```ts
// hooks/use-api.ts (sketch)
export function useApi<T>(
  path: string,
  params?: QueryParams,
  deps: unknown[] = []
): { data: T | null; meta?: ApiMeta; isLoading: boolean; error: ApiError | null; reload: () => void };
```

- Cancels in-flight requests with `AbortController` on param change/unmount.
- Re-runs when `path`/`params`/`deps` change (e.g. page, sort, filters).
- Mutations (create/update/delete) call `api.post/patch/delete` directly, then
  toast and `reload()` the list.
- **Loading, empty, and error states are REQUIRED on every data view** (`AGENTS.md`,
  spec `00` DoD): render `LoadingState` while `isLoading`, `EmptyState` when the
  result is empty, `ErrorState` (with retry) when `error` is set.

## 9. Standard states contract

Every list and detail page **must** implement, using the shared components:

| State   | Condition                         | Component                         |
|---------|-----------------------------------|-----------------------------------|
| Loading | request in flight (`isLoading`)   | `LoadingState` (skeleton for tables) |
| Empty   | success, zero rows/records        | `EmptyState` (with a create action if the role can create) |
| Error   | request threw `ApiError`          | `ErrorState` (message + `onRetry`) |
| 403     | `error.status === 403`            | `ErrorState` access-denied copy   |
| Success | data present                      | the table/detail/form UI          |

A page that only renders the happy path is **incomplete** and fails the DoD.

## 10. Accessibility & responsiveness basics

- **Keyboard:** all interactive controls focusable; visible focus ring
  (`focus-visible:ring-2 ring-primary`); Modal/Drawer trap focus and close on Esc;
  return focus to the trigger on close.
- **Labels:** every input has a `<label htmlFor>` (via `FormField`); icon-only
  buttons have `aria-label`; Modal/Drawer use `role="dialog"` + `aria-modal` +
  `aria-labelledby`.
- **Contrast:** semantic text meets WCAG AA against its background (use the `-600`
  tones on light surfaces / subtle `-50` pill backgrounds).
- **Responsive shell:** sidebar is persistent on `lg+`, collapses behind a
  hamburger (`MobileNav`) below `lg`; tables scroll horizontally on small screens;
  no fixed widths that clip text (§6).
- **Semantics:** use `<table>`/`<th scope>` for DataTable; `<nav>` for the sidebar;
  `<main>` for content.

## 11. Acceptance checklist (foundation)

- [ ] `node_modules/next/dist/docs/` consulted; no deprecated/assumed Next.js APIs;
      middleware (if used) verified against the installed version.
- [ ] `lib/api-client.ts` injects Bearer token, prefixes `NEXT_PUBLIC_API_URL`,
      parses `{ data, meta }`, throws typed `ApiError` from `{ message, errors }`,
      handles 401 (clear session + redirect), and serializes query params.
- [ ] `lib/auth.ts` provides `AuthProvider` + `useAuth()` exposing
      `{ user, login, logout, isLoading }`; hydrates via `GET /api/auth/me`.
- [ ] Login page authenticates and stores the token per the chosen strategy;
      storage tradeoff (XSS) documented in the README.
- [ ] Unauthenticated access to `/dashboard/*` redirects to `/login` (client guard;
      middleware optional and cookie-gated).
- [ ] `lib/permissions.ts` `canAccess()` mirrors the spec `04` matrix; sidebar nav
      and action buttons are role-filtered (UX only; backend 403 still authoritative).
- [ ] Design tokens defined in `globals.css` via Tailwind v4 `@theme`: zinc base +
      indigo primary + success/warning/danger/info; typography, spacing, radius,
      shadow scales applied consistently.
- [ ] UI is dense and product-like (no gradient hero, no one-note palette); text
      fits containers on desktop and mobile (no clipping; tables scroll).
- [ ] Shared components built: AppShell/Sidebar/Topbar, DataTable, Pagination,
      Modal, Drawer, FormField set, Button, Badge/StatusPill, Card/StatCard, Toast,
      ConfirmDialog, SearchInput, FilterBar, EmptyState, LoadingState, ErrorState.
- [ ] `useApi` (or chosen data layer) returns `{ data, meta, isLoading, error,
      reload }`; every list/detail page renders loading, empty, and error states.
- [ ] Accessibility basics met: keyboard focus, labels, dialog roles, mobile
      sidebar collapse.
- [ ] No file exceeds ~300–400 lines; components/hooks/types split as needed.
