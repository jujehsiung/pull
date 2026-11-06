# PULL demo — stack setup, one step at a time

Status: **all six services configured and verified (steps 1–6).** Each step below is independent of
the ones after it, and every step ends with `npm run check` telling you whether it worked.

| Step | Service | What it unlocks | Status |
| --- | --- | --- | --- |
| 1 | App (Next.js) | pages, styling, the agent trace UI | **done** |
| 2 | Neon | jobs, looks, requests, shipments | **done** (9 tables, 6 enums, write tested) |
| 3 | Cloudinary | uploads + the crop that makes the boards | **done** (signed upload + crop verified) |
| 4 | Resend | client link, request emails, magic-link login | **done** (sending-only key, capture on) |
| 5 | Shippo | rates, labels, tracking | **done** (live key, purchases gated) |
| 6 | Auth secrets | protected studio + revocable public links | **done** |
| 7 | Vercel | a deployable URL | open — nothing local depends on it |

---

## Where the app is right now

```sh
cd pull-demo
export PATH="../.tools/node/bin:$PATH"   # portable Node; no system node on this machine
npm run dev                              # http://localhost:3000
```

| Route | What it is |
| --- | --- |
| `/` | landing page (design applied from the Augment reference) |
| `/setup` | this checklist, rendered from the server environment |
| `/trace` | the **agent trace** — every tool call with input, output, duration and status |
| `/preview/client.html` | the client board, desktop + mobile (static design preview) |
| `/preview/showroom.html` | the showroom intake, desktop + mobile (static design preview) |

Copy the env template once:

```sh
cp .env.example .env.local
```

Never commit `.env.local` (it is git-ignored).

---

## Step 2 · Neon — the database

**You do:** create the project and copy one string.

1. Open <https://console.neon.tech> → **New Project**. Pick the region closest to you (for the demo,
   `AWS us-east-1` is fine), Postgres 17.
2. On the project dashboard press **Connect** → tab **Node.js** → copy the connection string. It looks
   like:
   ```
   postgresql://user:password@ep-xxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```
   Use the **pooled** string for the app. (Drizzle Kit works with either; if `db:push` complains,
   use the **direct** string from the same panel for the migration command only.)
3. Paste it into `.env.local`:
   ```
   DATABASE_URL=postgresql://…
   ```

**Then run:**

```sh
npm run db:push     # creates 9 tables + 6 enums in public schema
npm run check       # step 2 should turn ✅
```

**Verify by eye (optional):** Neon → **SQL Editor** and run:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by 1;
```

You should see: `boards, contacts, emails, events, jobs, looks, requests, shipments, users`.

**What it unlocks:** every Act 1–3 record. Until this is green, the app still runs — the agent trace
falls back to the server log.

**Gotchas**
- `?sslmode=require` is mandatory on Neon; without it the driver fails after a long timeout.
- A Neon project auto-suspends when idle; the first query after a pause takes ~1 s. Normal.
- `db:push` is the demo path (no migration files). Switch to `db:generate` + `db:migrate` when the
  schema stabilises.
- **Non-interactive `db:push` needs `--force`.** `strict: true` in `drizzle.config.ts` makes
  drizzle-kit ask for confirmation, and a piped shell has no TTY to answer: it dies with
  `Interactive prompts require a TTY terminal`. `npm run db:push -- --force` answers for you.
- **`db:push` is never a perfect no-op.** drizzle-kit 0.31 re-emits
  `ALTER TABLE contacts ALTER COLUMN emails SET DEFAULT …` on every run. The statement is
  idempotent and harmless, but "changes applied" therefore does not mean something changed.

---

### Verified with your project (2026-11-06)

Project **Pull**, region **AWS us-east-2**, Postgres 17, pooled host
`ep-snowy-union-bdtf0w0l-pooler.c-8.us-east-2.aws.neon.tech`. `DATABASE_URL` carries
`sslmode=require&channel_binding=require`; the serverless driver accepts both.

| Check | Result |
| --- | --- |
| driver connect | `select 1` → `1` |
| `db:push` | changes applied |
| tables | **9** — boards, contacts, emails, events, jobs, looks, requests, shipments, users |
| enums | **6** — email_status, job_status, look_read_source, look_status, request_status, shipping_mode |
| indexes | **11**, including the unique `contacts_brand_market_idx` and `shipments_request_idx` |
| write test | `insert` generated a UUID primary key, `select` returned the row, `delete` cleaned up, table left empty |

Two bugs surfaced here and were fixed rather than worked around:

1. **`drizzle.config.ts` crashed before touching the network** —
   `The "paths[0]" argument must be of type string. Received undefined`. It used
   `import.meta.dirname`, which is `undefined` once drizzle-kit bundles the config with esbuild.
   It now uses `process.cwd()`, which is the package root for every npm script.
2. **`npm run db:connect`** was written for exactly this step: it reads the connection string from
   the clipboard (or `argv`), writes `DATABASE_URL`, pushes with `--force`, retries against the
   direct host if the pooled endpoint refuses DDL, then verifies the tables and runs `npm run check`.

---

## Step 3 · Cloudinary — images and the crop

**You do:** copy three values.

1. <https://console.cloudinary.com> → **Settings → API Keys** → copy **Cloud name**, **API key**,
   **API secret**.
2. Paste into `.env.local`:
   ```
   CLOUDINARY_CLOUD_NAME=
   CLOUDINARY_API_KEY=
   CLOUDINARY_API_SECRET=
   ```
3. `npm run check` → step 3 ✅ (it calls Cloudinary's `ping`, so a wrong secret fails here).
4. `npm run media:test` → proves the two things `ping` cannot: that our **signature** is accepted
   for an upload, and that the **crop transform** returns an image. It uploads one 1×1 pixel, checks
   the transform against Cloudinary's built-in `sample` photo, then destroys the pixel again — the
   account is left as it was found.

**No upload preset is needed.** The server signs each upload with the secret
(`src/lib/cloudinary.ts → signedUpload`), so the browser uploads directly to Cloudinary and the
Vercel function body limit is never in the path.

**The crop is a transformation**, applied at delivery:
`effect=trim:20` → trim screenshot chrome → `c_fill,w_1200,h_1600` → `q_auto,f_auto`.
The original is never edited, so re-cropping later is a URL change, not a re-upload.

**What it unlocks:** Act 1 image handling — the board tiles and the client board images.

---

### Verified with your key (2026-11-06)

Cloud name `nvuweam9`. `npm run check` reports `ping ok`, and `npm run media:test` passes all three
stages:

| Check | Result |
| --- | --- |
| signed upload (same params as `signedUpload`) | accepted → `pull/demo-check/…`, then destroyed |
| board transform on a real photo | `200 image/webp` — trim → 3:4 fill → auto format |
| test asset cleanup | `result: ok` |

One finding worth keeping: **`trim:20` on a 1×1 solid pixel returns 400**, because there is nothing
left after trimming. That is a property of degenerate test images, not of the demo's screenshots —
which is why `media:test` checks the transform against a real photo, and why any future fixture that
is a flat colour will fail that stage.

---

## Step 4 · Resend — email

**You do:** create a key, and decide how you are sending.

1. <https://resend.com/api-keys> → **Create API key** (Sending access) → paste:
   ```
   RESEND_API_KEY=re_…
   ```
2. Sending domain — pick one:
   - **Have a domain?** <https://resend.com/domains> → **Add domain** → add the DNS records Resend
     shows → wait for **Verified**. Then:
     ```
     RESEND_FROM="PULL <pull@mail.yourdomain.com>"
     ```
     Now anything can be a recipient, so Act 2's request emails reach real brands.
   - **No domain yet (fast path):** leave
     `RESEND_FROM="PULL <onboarding@resend.dev>"`. That sender is a **hard 403 for every recipient
     except the address on your Resend account** — it is not a soft warning, and `+alias` addresses
     are still rejected ([Resend's own note](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)).
     So the magic-link login works (it goes to you), but Act 2's brand emails would fail. Fix it with
     the capture switch below rather than aliases.
3. **Demo mail capture — needed until a domain is verified.** Set one inbox:
   ```
   RESEND_REDIRECT_TO=jujehsiung@gmail.com
   ```
   `sendEmail()` then delivers every message addressed to anyone **other than** `AUTH_ALLOWED_EMAIL`
   to that inbox, with the real recipients prefixed into the subject
   (`[demo → press@brand.com] PULL request — …`) and a footer naming them. Mail to the stylist is
   untouched, so login still arrives normally. Remove the variable and real sending resumes — there
   is no other switch.
4. `npm run check` → step 4 ✅, and it tells you whether a domain is verified and where captured
   mail is routed.

**What it unlocks:** the magic-link login, the client link email, and the request emails in Act 2.
Act 3's label reply attaches the Shippo PDF to the same thread.

---

### Verified with your key (2026-11-06)

The key is **sending-only** (`restricted_api_key`) — the kind step 1 above recommends. That has one
consequence worth knowing: `GET /domains` answers `401`, so `npm run check` cannot read whether a
domain is verified with this key. It reports the scope rather than calling the key broken.

| Check | Result |
| --- | --- |
| `npm run mail:test -- jujehsiung@gmail.com` | `✓ accepted` — delivery proven to the account address |
| `npm run mail:test -- juje@viscosejournal.com` | `✗ 403` — "You can only send testing emails to your own email address (jujehsiung@gmail.com)" |
| `npm run check` → step 4 | ✅ `sending-only key` + `captured → jujehsiung@gmail.com` |

So the account address is confirmed as **jujehsiung@gmail.com**. Until `viscosejournal.com` is verified
in Resend, `juje@viscosejournal.com` cannot receive — that is a hard limit of the `resend.dev` sender,
not a configuration mistake. Verifying the domain removes the need for capture entirely.

---

## Step 5 · Shippo — labels and tracking

**You do:** copy the **test** token first.

1. <https://app.goshippo.com/settings/api> → **Test token** (starts `shippo_test_`). Paste:
   ```
   SHIPPO_API_KEY=shippo_test_…
   ```
2. `npm run check` → step 5 ✅ and it labels the mode `test`.
3. Only after a full run-through: swap in the **Live token**. A live label costs real money; the
   checker warns loudly when it sees a live key.

**What it unlocks:** Act 3 — rates from box/weight/address, then label purchase, then tracking.

**Gotchas**
- Shippo needs a valid **from** address (your studio) and **to** address; both are stored on the job.
- Test-mode labels and tracking numbers look real but ship nothing.
- Buying twice for one request is blocked in our code (unique row per request); do not retry blindly
  from the UI.

---

### Verified with your key (2026-11-06)

A **live** key was connected and the rates path was exercised end to end — no label was bought
(that costs money; purchases are gated, see below).

| Lane | Parcel | Result |
| --- | --- | --- |
| Paris → New York | 40×30×12 cm · 2.4 kg · declared $150 | **5 rates**, cheapest **Colissimo Domicile $64.43 / 5 days**, UPS Worldwide Expedited $363.11 / 3 days |
| New York → New York | same parcel | **18 rates**, cheapest **USPS Ground Advantage $7.57 / 2 days** |

**Two things this run taught us, now built in:**

1. **Cross-border lanes return zero rates without a customs declaration.** Shippo's shipment must
   carry `customs_declaration` (contents type, item description, weight, value, origin country) or
   every international carrier declines to quote. `src/lib/shippo.ts` now adds one automatically when
   `from.country !== to.country`, and the API returns Shippo's own messages when a lane quotes nothing.
2. **Live label purchases are gated.** With a live key, `buyLabel()` refuses unless
   `SHIPPO_ALLOW_PURCHASE=true`. Rates are free; transactions are not. Flip the flag only when you
   intend to spend, and expect one label to cost the quoted amount.

Your carrier accounts currently active: **UPS, Canada Post, Chronopost, Colissimo, CouriersPlease**.
That is why Paris → New York quotes Colissimo and UPS but not FedEx/DHL — connect those in
Shippo → Settings → Carriers if you want them in the comparison.

---

## Step 6 · Auth secrets

**You do:** generate two secrets and name the allowed sign-in address(es).

```sh
node -e "console.log('AUTH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('LINK_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

```
AUTH_SECRET=…
LINK_SECRET=…
AUTH_ALLOWED_EMAIL=you@yourdomain.com
```

Restart `npm run dev`, then `npm run check` → step 6 ✅.

- `AUTH_SECRET` signs the session cookie. `LINK_SECRET` signs the **public** client and showroom
  links — rotating it revokes every shared link without logging you out.
- Only `AUTH_ALLOWED_EMAIL` can request a magic link. The link is emailed through Resend and expires
  in 15 minutes.
- `AUTH_ALLOWED_EMAIL` accepts a **comma-separated list**, so the demo can be opened from more than
  one inbox — e.g. a work address and a phone-test address:
  ```
  AUTH_ALLOWED_EMAIL=jujehsiung@gmail.com,juje@viscosejournal.com
  ```
  Sign-in mail is never captured by `RESEND_REDIRECT_TO` (see step 4), so each address must be one
  Resend is actually allowed to deliver to.

**Testing on a second device.** A mailed link points at whatever `PUBLIC_BASE_URL` says, and
`localhost` means *that device*, not yours. Put your LAN address in `.env.local` and restart:

```
PUBLIC_BASE_URL=http://192.168.1.41:3000
```

Both devices must be on the same Wi-Fi, and the Mac must accept incoming connections on 3000
(firewall is off on this machine, so nothing to change). Find the address with
`ipconfig getifaddr en0` — it changes between networks, so re-check it if a link stops opening.

**What it unlocks:** everything behind `/studio` (coming in M1) and the two public links.

---

## Step 7 · Agent inference (DeepSeek now, ZooWork Managed Agents at the hackathon)

Two backends, one interface. The provider switch lives in `src/lib/agent/index.ts`; every call is
traced, so `/trace` shows which one ran.

### Today (pre-credit): DeepSeek

1. Get a key from <https://platform.deepseek.com/api_keys>.
2. Put it in `.env.local` **yourself** — do not paste it in chat:
   ```
   DEEPSEEK_API_KEY=sk-…
   DEEPSEEK_MODEL=deepseek-chat
   ```
3. Verify (read-only, free):
   ```sh
   npm run agent:check      # shows the key is present and /models answers
   curl -s localhost:3000/api/agent/status | jq .active   # -> "deepseek"
   ```
4. Try a draft:
   ```sh
   curl -s -X POST localhost:3000/api/agent/draft-email -H 'content-type: application/json' -d '{
     "brand":"CELINE","looks":[{"lookNo":27,"season":"AW26"}],
     "clientName":"Timothée Chalamet","jobTitle":"Oscar campaign",
     "shootDate":"2026-11-14","callInDate":"2026-11-12","returnDate":"2026-11-18",
     "studioAddress":"1 Stylist Way, New York NY 10013","shippingMode":"needs_label"
   }' | jq -r .body
   ```
   The response's `provider` is `deepseek` when the key works, `deterministic` when it does not.

### Tomorrow (hackathon): ZooWork Managed Agents

The SDK is installed (`@zoowork-ai/sdk` 0.14.0, checked against its `dist/AGENTS.md`). Nothing calls
it yet, because Agent tasks draw on the organization's **prepaid balance** and there are no credits.

When credits are on the account:

1. Create an API key at <https://platform.zoowork.ai> → API keys, and add funds under
   Organization settings → Billing.
2. Set the key yourself plus the billing approval flag:
   ```
   ZOOWORK_API_KEY=zwp_live_…
   ZOOWORK_ENABLED=true          # billing guard — only set after approving the plan
   # ZOOWORK_MODEL=litellm/…    # optional pin; otherwise the platform chat default
   ```
3. Check, still read-only (it reads `/balance`, it does **not** create an Agent):
   ```sh
   npm run agent:check
   ```
4. The first real draft creates one Agent (`pull-request-writer`, labels `app=pull-demo`,
   `AGENTS.md` persona, Idempotency-Key `pull-demo-agent-v1`), starts it, waits for
   `desired_state=running`, then opens one Session per draft and streams until `run.finished`.
   The Agent id is stored in `data/zoowork-agent.json` and reused — never created per message.
5. Actual charges: **ZooWork Platform → Usage**. There is no server-side spending cap; the
   `ZOOWORK_ENABLED` flag is ours.

### What AI is allowed to do

Only rewrite the request email. The demo validates every draft: if an approved look number is
missing from the model's output, the deterministic template is used instead. Nothing sends without
a human press.

## Step 8 · Vercel

1. Push `pull-demo/` to GitHub (it is inside this workspace; move it to its own repo when you deploy).
2. <https://vercel.com/new> → import the repo → framework **Next.js** (auto-detected).
3. **Settings → Environment Variables** → add the same keys from `.env.local` for
   *Production, Preview, Development*. Add `PUBLIC_BASE_URL=https://your-app.vercel.app` so emailed
   links point at the deployment, not localhost.
4. **Deploy.** Then open `/setup` on the deployment — it should show the same green steps.
5. Later: custom domain in **Settings → Domains**, and point `PUBLIC_BASE_URL` at it.

Function limits to know: 4.5 MB request body (we upload direct to Cloudinary, so this never bites)
and 60 s on Hobby (Shippo calls are ~0.5 s).

---

## Step 9 · The whole thing is configured

```sh
npm run check
```

Expected ending:

```
✅ step 1 · app
✅ step 2 · Neon (database)
✅ step 3 · Cloudinary (images)
✅ step 4 · Resend (email)
✅ step 5 · Shippo (labels)
✅ step 6 · auth secrets
✅ step 7 · agent inference (DeepSeek key, or ZooWork funded + enabled)

All steps configured. Run `npm run dev`.
```

Then the demo build continues with M1 (Act 1: job → import → board → publish) as specified in
[`../prd/prd-pull-demo-3acts.md`](../prd/prd-pull-demo-3acts.md), including the agent trace that is
already wired (`src/lib/agent/tracer.ts` + `/trace`).

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm` errors about `~/.npm` permissions | sandboxed home | always install with `--cache ./.npm-cache` (already in the notes) |
| `DATABASE_URL is not set` | env not loaded | `.env.local` in `pull-demo/`, restart `npm run dev` |
| Neon timeout | missing `sslmode=require`, or project waking | add the param; retry once |
| `db:push` fails on the pooled URL | pooled endpoints can refuse DDL | use the **direct** connection string for that command |
| Cloudinary `401` | wrong key/secret pair | regenerate the pair in the console |
| Resend `403 domain not verified` | sending from an unverified domain | verify the domain, or send only to your own address with `onboarding@resend.dev` |
| Shippo `401 Invalid token` | test token pasted as live, or whitespace | re-copy from the API page |
| Shippo rates empty | parcel or address rejected | check dimensions/weight units (cm, kg) and a full `zip` |
| Changes to `.env.local` ignored | Next caches env at boot | restart `npm run dev` |

---

## Security notes

- Keys live **server-side only**. The browser only ever sees a short-lived Cloudinary upload
  signature and the signed public link tokens.
- Public links carry `scope` (`client` or `intake`), an id and an expiry, HMAC-signed with
  `LINK_SECRET`. No client data in the URL.
- Nothing is sent and no label is bought without a human press.
