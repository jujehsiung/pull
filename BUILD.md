# BUILD.md — how we build PULL together

Read this before touching code. The spec is [`../prd/prd-pull-demo-3acts.md`](../prd/prd-pull-demo-3acts.md);
`SETUP.md` is the stack, `README.md` the routes. This file is the working agreement.

## What exists

Next.js 16 (App Router) · React 19 · Tailwind 4 · Drizzle + Neon · Cloudinary · Resend · Shippo.
Everything is connected: `npm run check` is green. `tsc --noEmit` must stay clean.

| Already built | Where |
| --- | --- |
| Schema, 9 tables | `src/db/schema.ts` (already pushed to Neon) |
| Drizzle client | `src/db/client.ts` — `db()`, throws without `DATABASE_URL` |
| Auth primitives | `src/lib/auth.ts` — `signToken`, `createMagicToken`, `consumeMagicToken`, `startSession`, `getSession`, `signLink`, `verifyLink` |
| Allow-list | `src/lib/env.ts` — `allowedEmails()`, `isAllowedEmail()` |
| Cloudinary | `src/lib/cloudinary.ts` — `signedUpload(folder)`, `boardImageUrl(publicId, width)`, `uploadRaw` |
| Resend | `src/lib/resend.ts` — `sendEmail()`, `magicLinkEmail()`; capture routing is on |
| Shippo | `src/lib/shippo.ts` — `getRates()`, `buyLabel()` (purchase gated) |
| Agent runtime | `src/lib/agent/index.ts` — `runAgentTask()`, `activeProvider()` |
| Tracer | `src/lib/agent/tracer.ts` — `withTrace(ctx, fn)` → `events`, `readTrace(jobId)` |
| Trace UI | `src/components/AgentTrace.tsx` (props: steps), `src/app/trace/page.tsx` (fixture) |

**Not built yet:** everything user-facing — auth routes, `/studio`, import pipeline, client board.

## Conventions

- **Server mutations = Server Actions** (`"use server"`) in `src/server/actions/*.ts`. Use API routes
  only for auth callbacks and anything streaming (SSE).
- **Authorisation:** every action and `/studio` page calls `requireStylist()` (add it in `src/lib/auth.ts`).
  Never trust a `jobId` from the client — re-read the job and check `userId`.
- **Queries** live in `src/server/queries/*.ts`, typed with Drizzle; no raw SQL unless a query needs it.
- **Traced tool calls:** anything the PRD §7 table calls a step goes through `withTrace({ jobId, tool, args }, fn)`.
  Tool names: `cloudinary.upload`, `cloudinary.trim`, `tesseract.read`, `agent.parse`, `agent.group`,
  `resend.send`, `shippo.rates`, `shippo.label`, `<provider>.run`. Failures are traced too.
- **No new dependencies** without a reason in the PR that says why. OCR is `tesseract.js` (already a dep).
- **Styling:** Tailwind 4 + the tokens in `src/app/globals.css` (`--paper`, `--ink`, `--muted`, `--line`,
  `--accent`, `--ok`, `--danger`, `--dark*`). Use them via `var(--…)` or the existing utility classes in
  `globals.css`. Do not restyle the landing page or `/setup`.
- **Copy tone:** lowercase eyebrows, mono for numbers/ids, no exclamation marks. Match `src/app/page.tsx`.
- **Accessibility:** 44 px targets, focus-visible rings, status never by colour alone.

## File ownership (avoid collisions)

| Owner | Scope |
| --- | --- |
| lead | `src/lib/auth.ts`, `src/lib/env.ts`, `src/server/**`, `src/app/login/**`, `src/app/studio/layout.tsx`, `src/app/studio/page.tsx`, `src/app/studio/jobs/**`, `src/app/api/auth/**`, `src/app/api/studio/trace/**`, `src/db/schema.ts` |
| import-pipeline | `src/components/import/**`, `src/lib/agent/ocr.ts`, `src/lib/agent/parse.ts`, `src/app/api/studio/import/**`, `scripts/ocr-check.mjs` |
| client-board | `src/app/b/**`, `src/components/client-board/**`, `src/lib/public-link.ts` |

Nobody but **lead** edits `src/db/schema.ts`, `src/lib/auth.ts`, `globals.css`, `package.json`.
If you need a change there, message lead instead of editing.

## Definition of done for any task

1. `npx tsc --noEmit` clean.
2. `npm run check` still green.
3. The PRD acceptance criterion for the FR you touched is actually exercised (say how you verified it —
   curl, a script, or a screenshot of the running app).
4. Trace steps appear for anything the PRD §7 calls a tool call, with duration and status.
5. Report back: files touched, what you verified, what is stubbed.

## Local commands

```sh
export PATH="../.tools/node/bin:$PATH"
npm run dev            # http://localhost:3000  (already running; it hot-reloads)
npx tsc --noEmit
npm run check
npm run media:test     # Cloudinary upload + crop
npm run mail:test -- you@x.com
```

Fixtures for the 10-image import: `../agent-board/fixtures/looks/*.png` (5 brands × 2 looks).
Copy them to `public/fixtures/looks/` if you need them served.

## Status — 2026-11-06 15:45 ET

| Piece | State |
| --- | --- |
| Auth (magic link, allow-list, session) | done — /login, /api/auth/callback, requireStylist |
| Studio shell, job list, new job (FR-1) | done — dates validated by one shared rule |
| Job home: publish + client link (FR-7) | done — form action, tested via curl; republish keeps the URL |
| Send the link (FR-8) | done — Resend, recorded in emails |
| Look grid: edit / hide / restore (FR-4, FR-6) | done — hide/restore are form actions and were curl-tested |
| Import pipeline (FR-2,3,4,5,23) | **done** — mounted; route E2E 5 boards/10 looks; FR-4 gate 10/10 (ocr:check) |
| Client board (FR-9) | done — dark lookbook, 404s on tampered tokens |
| Client review (FR-10, FR-11) | in progress — client-board owns task-3 |
| Report (FR-12) | done — ReportCard wired to the job page; reopen action included |
| Request emails (FR-13, FR-14) | **done** — draft → approve → send verified end to end (job reached requests_sent) |
| Act 3 intake + rates (FR-17, FR-18) | **done** — verified on the fixture request: 5 rates stored, 3 shown, nothing bought |
| Act 3 labels/tracking (FR-19..FR-21) | **done** — choose persists, purchase gated (verified: €64.43 chosen, nothing bought), webhook + reply verified |

Goal: .dev.log and npm run check must stay green throughout. Fixture job for Act 1/2 testing:
`2d726bee-e9c9-487b-a6da-c410942d2adf` (client Timothée Chalamet, Oscar campaign, published).

Fixture state (job 2d726bee…): published, CELINE look 27 approved with a note, look 4 passed,
one CELINE request sent through Resend (captures to the stylist inbox), job status = requests_sent.
`users.studio_address` is a PLACEHOLDER (110 Greene Street, New York). Replace it before the demo —
it is what every request email and every Shippo rate quotes.

M3 note: live Shippo quotes **EUR for FR-origin and USD for US-origin** shipments. Never render a
currency symbol that is not the rate's own currency — the fixture request (CELINE, Paris showroom →
NY studio, 40x30x12 cm, 2.4 kg) returned 5 rates, cheapest Colissimo Domicile 64.43 EUR / 5 days,
UPS Worldwide Expedited 363.11 EUR / 3 days. shipments.chosen_rate_id is null; nothing was bought.

M4 (demo tooling) is with import-pipeline: reset/seed/preflight scripts + DEMO.md run-of-show.
Open items before "demo ready": contacts page (client-board), activity log FR-22, rate limiting (M4),
Playwright spec (M4), studio address placeholder, Resend domain decision, one optional real label buy.

Demo-day preflight: `npm run demo:check` must end READY. Two warnings are expected and intentional:
mail captured to the stylist inbox (until a verified Resend domain) and an empty webhook secret.
Reset between runs: `npm run demo:reset -- --job <id>` (targeted) or `-- --all --yes` (everything).

Incident (2026-11-06): a scratch seed during M3 overwrote users.studioAddress and a crash before its
cleanup line meant the restore never ran; the following run then restored the already-corrupted value.
Current value (Juje Studio, 155 Wooster St) is FABRICATED, not real studio data — the user must replace
it. Rules: scratch tests never mutate the primary user row; capture/restore goes in try/finally or a
transaction.

Bug found by the E2E build (fixed): import brands are Title Case ("Bottega Veneta") while seeded
contacts were UPPERCASE ("BOTTEGA VENETA"), and drafting matched brands exactly — so a freshly
imported job produced contactId null, shippingMode unknown, a blank email and NO intake link. Fixed
with src/lib/brand.ts (brandKey/sameBrand) used by drafts.ts and actions/requests.ts; requests adopt
the contact's casing. Verified both branches across casing: CELINE→showroom_ships, BOTTEGA VENETA→
needs_label with an intake link in the body. Contacts remain un-seeded by design: the demo clicks
"Load 5 demo brands" on /studio/contacts, and the E2E does the same as an Act 3 precondition.

Bug found by the M4 E2E and fixed (intake form): the weight input had min={0.05} step={0.1}, and HTML
step is measured FROM min — so the valid grid was 0.05, 0.15 … and the form's own default 1.2 failed
native validation with "nearest valid values are 1.15 and 1.25". The form never posted, so no server
test could see it. Now step={0.05}. Lesson for E2E.md: native constraint validation is invisible to
HTTP-level tests.
