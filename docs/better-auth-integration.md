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

## Next steps

- Model the required auth tables (users, sessions, passkeys, OAuth accounts) in Drizzle and plan migrations.
- Scaffold `/api/auth/*` Elysia routes using Better Auth, wiring cookies to the shared domain and reusing the existing rate limiter.
- Update the SSR login route to call the new endpoints via `routeAction$`, and add locale-aware redirects for OAuth callbacks.

## Auth database schema snapshot (Drizzle)

- `users` — `uuid` primary key with default `gen_random_uuid()`, unique `email`, optional `email_verified_at` timestamp, optional `password_hash`, and `created_at`/`updated_at` timestamps (both default `now()`).
- `auth_keys` — primary key `id` (provider-scoped key identifier), `user_id` FK to `users` (cascade delete), optional `hashed_password`, optional `provider` + `provider_user_id` pair (unique composite index), optional `expires_at`, and `created_at`/`updated_at` timestamps.
- `auth_sessions` — primary key `id`, `user_id` FK to `users` (cascade delete), `expires_at`, optional `refresh_expires_at`, and `created_at`/`updated_at` timestamps.
- `passkeys` — primary key `id` (credential ID), `user_id` FK to `users` (cascade delete), `name`, `public_key`, `counter` bigint default `0`, optional `device_type`, `backed_up` boolean default `false`, optional `authenticator_attachment`, optional text[] `transports`, optional `last_used_at`, plus `created_at`/`updated_at` timestamps.
- Migration: `apps/api/drizzle/20251225231103_auth-tables/migration.sql` creates all four tables, foreign keys, and indexes; `apps/api/src/db/schema.ts` holds the source definitions and corresponding Zod insert schemas for validation.
