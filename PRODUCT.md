# PRODUCT.md — productising PULL

**Status:** plan, not started. Decisions recorded 2026-11-07 with the founder.

PULL today is the demo: a client link where someone approves looks and circles the pieces they want,
a bell that says what came back, and an agent that turns approvals into showroom requests. What is
missing is not design — it is identity, persistence and billing.

## What we're selling

A **per-seat subscription for stylists**. A studio pays for the people who do the work; the client
link and the showroom link stay free and login-less, because that is the product's whole magic.

## Decisions (recorded)

| decision | value |
|---|---|
| Identity | **Clerk** — replaces the magic-link · HMAC-cookie session |
| Billing | **Stripe**, subscription with a **seat** quantity |
| Hosting | **Vercel + Neon** (not Fly.io — the agent is an outbound API call) |
| Agent | **ZooWork** once the plan/credits are approved, **DeepSeek** until then |
| Observability | Block Convey PRISM optional (model calls only; `/trace` stays our `events`) |
| Public links | `/b/[token]`, `/i/[token]` stay **token-only** — never Clerk-gated |

## Non-goals for v1

Client accounts (clients must never log in) · mobile app · marketplace · carriers beyond Shippo ·
SSO/SAML (Clerk can add later) · SOC 2 · self-hosting.

## Phase 1 — Accounts with Clerk (2–3 days)

- `@clerk/nextjs`: `ClerkProvider` in `src/app/layout.tsx`; `clerkMiddleware` for `/studio` while the
  existing rate limiter keeps covering `/b` and `/i` (`src/middleware.ts`).
- `src/lib/auth.ts` becomes an adapter, not a session store: `getStylist()` reads `auth()`, ensures the
  `users` row by `clerk_user_id`, resolves the membership → workspace; `requireStylist()` redirects to
  Clerk sign-in. Keep `signLink` / `verifyLink` untouched — they are the client-token machinery.
- Schema: `users.clerk_user_id` (unique); new `workspaces` (`name`, `plan`, `seat_count`,
  `stripe_customer_id`, `stripe_subscription_id`, `current_period_end`); new `memberships`
  (`workspace_id`, `user_id`, `role`); re-key `jobs.user_id` → `jobs.workspace_id`.
- Remove `/login` and the magic-token actions, or keep them behind a `DEMO_LOGIN` flag for the
  hackathon deploy.
- `/studio/layout` shows the workspace and Clerk's `UserButton`; `/setup` gains Clerk and Stripe steps.

**Done when:** a new sign-up lands in a personal workspace, creates a job, and the client link works
logged out; the existing demo data is migrated into the first workspace.

## Phase 2 — Seats with Stripe (2–3 days)

- Product "stylist seat", monthly + annual price.
- **Seat = an active membership** (owner or stylist). Inviting someone increments the subscription
  quantity with proration; removing decrements; the owner cannot be removed.
- Checkout on workspace creation; Billing Portal for upgrades/cancellation.
- `/api/webhooks/stripe`: verify the signature; handle `checkout.session.completed`,
  `customer.subscription.updated|deleted`, `invoice.payment_failed`; store status, quantity and period
  on the workspace. Idempotent by Stripe event id (new `stripe_events` table).
- Entitlements checked server-side (e.g. free = 1 seat; paid gates extra seats and features). Never in
  the client.

**Done when:** a test-mode checkout produces a seat; the webhook keeps quantity in sync; a cancelled
workspace goes read-only at period end without breaking client links.

## Phase 3 — Persist the surfaces we designed

- **Client decisions + markup on the look** (`looks.client_status` exists; add `looks.markup` — a
  Cloudinary public id or a data URL) and render both on `/b/[token]` and in the studio.
- **Port the review flow:** `/client` layout → `/b/[token]`; `/requests` → `/studio/jobs/[id]/requests`
  (draft → approve → send already exists server-side); bell in the studio chrome.
- **Showroom board:** one link per showroom listing all its requests, parcel weight on intake, label
  downloadable from the board.
- **Contacts:** agent categorisation + showroom matching + phonebook (`.vcf`) import beside CSV.

## Phase 4 — Product hardening

Client-link lifecycle (rotate/revoke, expiry, open counts) · verified sending domain and bounces ·
PII/subprocessor decisions (PRISM, Cloudinary, Resend) and retention · error tracking · accessibility
pass on the public pages · rate limits already exist.

## Phase 5 — Go live

Prod Vercel project · Neon prod branch · Clerk prod instance · Stripe live keys · custom domain +
`PUBLIC_BASE_URL` · Resend DNS (`DNS-RESEND.md`) · `/setup` green on the deployment · pricing page,
terms, privacy, support inbox.

## Data model changes, in one place

| change | why |
|---|---|
| `users.clerk_user_id` | identity comes from Clerk |
| `workspaces`, `memberships` | teams, seats, ownership |
| `jobs.workspace_id` (replaces `user_id`) | data scoped to a studio |
| `looks.markup` | circled pieces travel with the approval |
| `stripe_events` | webhook idempotency |
| `workspaces.plan / seat_count / stripe_*` | entitlements and billing |

## Open questions for juje

1. **Seat definition:** per active stylist (recommended) or per workspace with unlimited members?
2. **Free tier:** 1 seat and how many jobs? Trial length?
3. **Demo data:** keep the seeded demo workspace as a sandbox account, or wipe before launch?
4. **Magic link:** keep as a demo-only flag, or delete with Clerk?
5. **Client links:** default expiry (30 days today) and whether re-publishing rotates the token.

## Risks

- **Clerk ↔ DB drift:** lazy `ensureUser` on every request plus a unique `clerk_user_id`; no webhook
  needed for the happy path.
- **Stripe webhook ordering:** store the event id and always write from the subscription's *latest*
  state, not the event's payload.
- **Never Clerk-gate a client link** — the whole product is that the client does nothing.
- **`user_id` → `workspace_id`** touches every query and action; one migration plus a sweep of the
  studio actions is the risky part of Phase 1.
