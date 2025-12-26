# Better Auth integration design

## Current authentication surface

- **Web app:** The localized login page is SSR-only, rendering a static email/password form without any submit handler or session wiring. There is no client-side auth state or server action attached to the form, so credentials are not processed today. 【F:apps/web/src/routes/[locale]/login/index.tsx†L1-L78】
- **API:** The Elysia server exposes health checks, store item pagination, chat history, a simple AI echo endpoint, and two WebSocket surfaces (store updates and chat). None of these routes perform authentication or session validation; inputs are gated only by rate limiting and payload validation. 【F:apps/api/src/server/app.ts†L1-L210】【F:apps/api/src/server/app.ts†L210-L360】

## Requirements vs. Better Auth capabilities

- **Passkeys:** Better Auth advertises WebAuthn/passkey support, covering registration and assertion flows alongside email/password. This meets the requirement for passwordless hardware-backed login.
- **OAuth providers:** The library ships social sign-on plugins (e.g., Google, GitHub, Apple, Discord, Microsoft) and a generic OIDC path, so we can satisfy the requested provider list without bespoke OAuth plumbing.
- **Session model:** Better Auth provides database-backed session storage with httpOnly cookies and rotation hooks, and can emit JWT/compact tokens for edge-friendly verification when needed.
- **Runtime compatibility:** It is framework-agnostic and supports Node/Bun servers; stateless token verification enables edge runtimes when a database round trip is undesirable. WebAuthn operations run in the browser, so the server side only needs to sign/verify challenges.

## Hosting surface decision

- **Keep auth APIs in Elysia:** Centralizes callback handling, token issuance, and cookie setting alongside the existing `/api` namespace, reducing duplication and letting WebSocket handlers reuse the same session validator. Elysia already owns rate limiting and Valkey connectivity, which can be shared for auth routes.
- **Use Qwik SSR for UX only:** The SSR login route remains the UI shell; form submissions call the Elysia auth endpoints via `routeAction$`/`server$` helpers, keeping credentials off the client bundle and out of Qwik render functions.

## Proposed request/response flows

- **Email/password sign-in:** `POST /api/auth/sign-in` (Elysia + Better Auth) validates credentials, rotates the session, and sets `Secure`, `HttpOnly`, `SameSite=Lax` cookies (`session`, `refresh`). Qwik `routeAction$` proxies the form and redirects on success; failures map to localized error copy without exposing error bodies.
- **Signup (if enabled):** `POST /api/auth/sign-up` creates the user, issues initial session cookies, and triggers email verification hooks if configured.
- **Passkey registration:** Qwik action calls `POST /api/auth/passkey/challenge` to fetch a WebAuthn create challenge (JSON). The browser completes `navigator.credentials.create` and posts the attestation to `POST /api/auth/passkey/register`; server stores credential IDs/public keys and sets session cookies.
- **Passkey sign-in:** Similar round-trip using `/api/auth/passkey/assertion` for the challenge and `/api/auth/passkey/verify` for assertion verification; successful verification rotates the session cookies.
- **OAuth start:** `GET /api/auth/oauth/:provider/start` returns a 302 to the provider with PKCE/state. Qwik pages link to this endpoint directly to avoid embedding secrets.
- **OAuth callback:** Provider returns to `/api/auth/oauth/:provider/callback`; Elysia finalizes the login, links the OAuth account, and sets session cookies before 302 back to the locale-aware return URL (e.g., `/{locale}/` or the original `redirect_uri`).
- **Session introspection:** SSR handlers call `POST /api/auth/session` (or verify a stateless token) to fetch the current user/session claims for gating protected routes without hitting the database on every request if stateless mode is enabled.
- **Sign-out:** `POST /api/auth/sign-out` revokes the active session (and refresh token, if present) and clears cookies; Qwik UI triggers this via a server action and redirects to the public home page.

## Implemented surface

- **API:** Added dedicated Elysia routes for Better Auth under `/api/auth`, including email/password sign-in/up, session introspection, passkey, and OAuth callback delegation. Better Auth’s handler still owns passkey/OAuth endpoints while Elysia shapes request bodies and mirrors `Set-Cookie` headers. 【F:apps/api/src/server/routes/auth.ts†L1-L43】【F:apps/api/src/server/app.ts†L1-L95】
- **Web:** Login and registration pages now use `routeAction$` + `<Form>` to post to the API, forward refreshed cookies, and render localized errors while keeping credentials server-side. Passkey login/registration buttons progressively enhance the forms by calling the WebAuthn challenge/verify endpoints only on user interaction. 【F:apps/web/src/routes/[locale]/login/index.tsx†L1-L219】【F:apps/web/src/routes/[locale]/register/index.tsx†L1-L211】
- **SSR guard:** Protected SSR routes validate the Better Auth session server-side via `/api/auth/session` and redirect unauthenticated visitors to the localized login page with a callback to return post-auth. 【F:apps/web/src/routes/[locale]/store/index.tsx†L1-L30】【F:apps/web/src/server/auth/session.ts†L1-L39】

## Cookie and session strategy

- **Cookies:** Use `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/` cookies for `session` and `refresh` (if using a sliding refresh model). Domain should be configurable (e.g., `APP_COOKIE_DOMAIN`) to align app and API origins. Add a non-HttpOnly `csrf_token` for double-submit checks on state-changing POSTs from SSR forms.
- **Session storage:** Default to database-backed sessions (Postgres) managed by Better Auth. Optionally enable a signed, short-lived stateless access token for edge SSR while keeping refresh tokens server-only.
- **Rotation:** Rotate session IDs on every OAuth/passkey/email-password login and on refresh to limit replay. Enforce device-bound metadata (user agent hash, IP slice) when verifying refresh tokens.

## Route ownership and boundaries

- **Elysia (API):** Owns all auth routes (`/api/auth/...`), OAuth callbacks, session verification, cookie issuance/clearing, and WebSocket auth guards.
- **Qwik SSR routes:** Own the UX—login/passkey/OAuth buttons—implemented with `routeAction$` calls to the API. SSR `onRequest` can read the `session` cookie to prefetch user context (via API or stateless verification) without touching the client bundle.
- **Static assets:** No auth logic or secrets in client JavaScript; rely on progressive enhancement so forms degrade gracefully without JS.

## Edge/server compatibility considerations

- **Serverful default:** Primary target is the existing Bun/Elysia server; DB-backed sessions and Valkey rate limiting run there.
- **Edge optionality:** If deploying Qwik SSR to an edge runtime, prefer the stateless token option for session checks and reserve refresh/session rotation for the centralized Elysia origin to avoid blocking on database connections at the edge.

## Configuration surface

- Core secrets live in `.env` and are validated in both apps: `BETTER_AUTH_COOKIE_SECRET`, `BETTER_AUTH_RP_ID`, and `BETTER_AUTH_RP_ORIGIN` (falls back to `BETTER_AUTH_ORIGIN` / `PRERENDER_ORIGIN` for SSR preview).
- In non-production (`NODE_ENV` not set to `production`), missing Better Auth core secrets fall back to the local dev defaults (`dev-cookie-secret`, `localhost`, `https://localhost:4173`); production requires explicit values.
- OAuth providers are opt-in by setting paired env vars per provider (e.g., `BETTER_AUTH_GOOGLE_CLIENT_ID` and `BETTER_AUTH_GOOGLE_CLIENT_SECRET`). Validation requires both halves when either is present.
- Passkeys require HTTPS and an RP ID + origin matching the browser host (e.g., `localhost` + `https://localhost:4173` when fronted by Traefik + mkcert in dev).

## Next steps

- Model the required auth tables (users, sessions, passkeys, OAuth accounts) in Drizzle and plan migrations.
- Scaffold `/api/auth/*` Elysia routes using Better Auth, wiring cookies to the shared domain and reusing the existing rate limiter.
- Update the SSR login route to call the new endpoints via `routeAction$`, and add locale-aware redirects for OAuth callbacks.

## Auth scaffolding (API)

- `apps/api/src/auth/auth.ts` initializes Better Auth against the shared Postgres client with `drizzleAdapter(db, { provider: 'pg' })`, pins the base path to `/api/auth`, enables email/password auth, and installs `passkey()` for WebAuthn flows.
- Exported helpers:
  - `handleAuthRequest(request)` forwards an incoming request to `auth.handler`, allowing an Elysia route to delegate Better Auth endpoints.
  - `signInWithEmail` and `signUpWithEmail` wrap the email/password endpoints and return `Response` objects (cookies included) suitable for Elysia route handlers.
  - `validateSession` wraps `getSession` and returns `{ headers, response, status }`, making it easy to gate routes and propagate refreshed cookies from middleware.

## Auth database schema snapshot (Drizzle)

- `users` — `uuid` primary key with default `gen_random_uuid()`, required `name`, unique `email`, boolean `email_verified` default `false`, optional `image` and `email_verified_at`, optional `password_hash`, and `created_at`/`updated_at` timestamps (both default `now()`).
- `auth_keys` — primary key `id`, `user_id` FK to `users` (cascade delete), optional `hashed_password`, optional `provider` + `provider_user_id` pair (unique composite index), optional OAuth fields (`access_token`, `refresh_token`, `id_token`, `access_token_expires_at`, `refresh_token_expires_at`, `scope`), optional `expires_at`, and `created_at`/`updated_at` timestamps.
- `auth_sessions` — primary key `id`, `user_id` FK to `users` (cascade delete), required `token`, optional `ip_address` + `user_agent`, `expires_at`, optional `refresh_expires_at`, and `created_at`/`updated_at` timestamps.
- `passkeys` — primary key `id`, `user_id` FK to `users` (cascade delete), optional `name`, required `credential_id`, `public_key`, `counter` bigint default `0`, optional `device_type`, `backed_up` boolean default `false`, optional `authenticator_attachment`, optional text `transports`, optional `last_used_at`, optional `aaguid`, plus `created_at`/`updated_at` timestamps.
- `verification` — primary key `id`, indexed `identifier`, `value`, `expires_at`, and `created_at`/`updated_at` timestamps (both default `now()`).
- Migration: `apps/api/drizzle/20251225231103_auth-tables/migration.sql` creates the base auth tables; `apps/api/drizzle/20251226024151_nosy_nicolaos/migration.sql` adds Better Auth-required columns plus the `verification` table; `apps/api/src/db/schema.ts` holds the source definitions and corresponding Zod insert schemas for validation.
