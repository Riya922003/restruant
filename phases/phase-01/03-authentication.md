# Phase 1 — Spec 03: Authentication

> Real login, password hashing, JWT issuance/verification, and the auth
> middleware. Replaces the no-op stubs in `Backend/src/middlewares/auth.middleware.js`
> and `Backend/src/modules/auth/*`. Pairs with spec `04` (RBAC).

## 1. Requirements (from AGENTS.md)

- Secure login.
- Password hashing.
- JWT or secure session based auth. **Decision: stateless JWT** (access token).
- Role based authentication and authorization (authorization detailed in `04`).

## 2. Dependencies to add

`Backend/package.json`:
- `bcrypt` (hashing). Fallback `bcryptjs` if native build fails on the target
  environment. Cost factor **10**.
- `jsonwebtoken` (sign/verify).
- `zod` (validation, shared across modules — see spec `05`).

## 3. Password hashing

- Hash with bcrypt cost 10 on user create and on password change.
- Store only `password_hash` (spec `01` `users.password_hash`). Never store or log
  plaintext.
- Compare with `bcrypt.compare` on login.
- Helper location: `Backend/src/modules/auth/auth.service.js` or a small
  `Backend/src/utils/password.js` (`hashPassword`, `verifyPassword`). Keep it in
  one place; the seed script (spec `02`) reuses `hashPassword`.

## 4. JWT design

- **Access token only** in Phase 1 (no refresh token, keep it simple and secure
  enough for the assessment). Optional refresh token is a Phase 3 nicety.
- Signing secret: `env.jwtSecret` (`JWT_SECRET`). Startup must fail fast if
  `JWT_SECRET` is empty (add a guard in `config/env.js` or server boot).
- Algorithm: `HS256`.
- Expiry: `12h` (configurable via `JWT_EXPIRES_IN`, default `12h`).
- Payload (claims):
  ```json
  { "sub": <user_id>, "role": "<user_role>", "email": "<email>", "iat": ..., "exp": ... }
  ```
  Keep the payload minimal. `sub` is the user id; `role` enables RBAC without a DB
  round-trip. Do not put sensitive data in the token.
- Helpers: `Backend/src/utils/jwt.js` (`signAccessToken(user)`, `verifyToken(token)`).

## 5. Token transport

- Client sends `Authorization: Bearer <token>` on every protected request.
- Phase 1 stores the token client-side (see spec `11` for the exact frontend
  storage decision — `httpOnly` cookie preferred if feasible with the Next.js
  version, otherwise in-memory + localStorage with the tradeoff documented).
- The backend accepts the `Authorization` header regardless of frontend storage
  choice, so both work.

## 6. Endpoints

Mounted under `/api/auth` in `Backend/src/modules/auth/auth.routes.js`.

### 6.1 `POST /api/auth/login`
- **Public** (no auth middleware).
- Body (Zod `loginSchema`): `{ email: string(email), password: string(min 1) }`.
- Flow: normalize email to lowercase → fetch active user by email → if not found
  or `is_active=false` → 401 `Invalid credentials` → `bcrypt.compare` → on
  mismatch 401 `Invalid credentials` (same message, no user enumeration) → sign
  token → update `users.last_login_at = now()` → respond.
- Success `200`:
  ```json
  { "data": { "token": "<jwt>", "user": { "id": 1, "full_name": "...", "email": "...", "role": "owner" } } }
  ```
- Never return `password_hash`. A shared `toPublicUser(row)` mapper strips it.

### 6.2 `GET /api/auth/me`
- **Protected** (auth middleware).
- Returns the current user resolved from `req.user` (re-fetched from DB for fresh
  `is_active`/role, or trusted from token — re-fetch is safer):
  ```json
  { "data": { "id": 1, "full_name": "...", "email": "...", "role": "owner", "is_active": true } }
  ```
- If the user no longer exists or is deactivated → 401.

### 6.3 `POST /api/auth/logout`
- **Protected**. Stateless JWT has no server session to destroy, so this is a
  client-side token discard. Endpoint returns `200 { "data": { "success": true } }`
  for a clean frontend contract. (If cookie-based, clear the cookie here.)

### 6.4 `POST /api/auth/change-password` (recommended, small)
- **Protected**. Body: `{ current_password, new_password (min 8) }`.
- Verify current, hash new, update. 400 on wrong current password.
- Enables the profile page; also used by Staff Management admin reset (spec `09`).

> Self-registration is **not** exposed. Users/staff are created by Owner/Manager
> via the Staff module (spec `09`). No public signup endpoint in Phase 1.

## 7. Auth middleware (implement the stub)

`Backend/src/middlewares/auth.middleware.js`:

```js
// Pseudocode contract
function authMiddleware(req, res, next) {
  1. Read Authorization header. If missing or not "Bearer <token>" -> 401.
  2. verifyToken(token). On invalid/expired -> 401 "Invalid or expired token".
  3. Attach req.user = { id: payload.sub, role: payload.role, email: payload.email }.
  4. next().
}
```
- Throws `ApiError(401, ...)` (or calls `next(err)`) so the central error
  middleware formats it.
- Applied globally to `/api` **except** `POST /api/auth/login` (and `/health`,
  which is outside `/api`). Two options:
  - Mount `authMiddleware` inside each protected module's routes, **or**
  - Apply it on the `/api` router and whitelist the login route before it.
  Recommended: apply per-module (explicit) or via a small wrapper that skips the
  login path. Document the choice in spec `05`.

## 8. Error semantics

| Case                                   | Status | Message                     |
|----------------------------------------|--------|-----------------------------|
| Missing/malformed Authorization header | 401    | Authentication required     |
| Invalid/expired token                  | 401    | Invalid or expired token    |
| Bad email/password on login            | 401    | Invalid credentials         |
| Deactivated user                       | 401    | Invalid credentials         |
| Wrong current password (change-pw)     | 400    | Current password is incorrect |
| Validation failure (bad body shape)    | 422    | Validation failed + errors[]|

- Login must return the **same** message for "no such user" and "wrong password"
  to avoid user enumeration.

## 9. Security notes

- `JWT_SECRET` must be long and random in real deployments (README env section).
  Boot fails if unset/short.
- Rate-limiting login is a Phase 3 nicety; not required for Phase 1 but note it as
  a known limitation.
- Do not log tokens or password fields. Ensure request logging (if any) redacts
  `password`/`Authorization`.
- CORS already restricts origin to `FRONTEND_ORIGIN` (`app.js`). Keep
  `credentials: true` if cookie-based auth is used.

## 10. Files to implement

```
Backend/src/modules/auth/
  auth.routes.js       # POST /login (public), GET /me, POST /logout, POST /change-password
  auth.controller.js   # HTTP handlers, response envelope
  auth.service.js      # authenticateUser, getMe, changePassword (SQL + bcrypt)
  auth.validation.js   # loginSchema, changePasswordSchema (Zod)
Backend/src/utils/jwt.js         # signAccessToken, verifyToken
Backend/src/utils/password.js    # hashPassword, verifyPassword (or inside auth.service)
Backend/src/middlewares/auth.middleware.js   # implement real verification
```

## 11. Acceptance for this spec

- [ ] Login returns a valid JWT + public user for each seeded role.
- [ ] Protected routes reject missing/invalid/expired tokens with 401.
- [ ] `GET /api/auth/me` returns the current user; 401 if deactivated.
- [ ] Passwords are bcrypt-hashed; no plaintext stored or returned anywhere.
- [ ] `password_hash` never appears in any API response.
- [ ] Login is uniform on failure (no user enumeration).
- [ ] Server refuses to boot without `JWT_SECRET`.
