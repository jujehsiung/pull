# DEMO.md — the PULL run-of-show

The three acts, what to click, what should appear, and which vendor call is being exercised.
Spec: [`../prd/prd-pull-demo-3acts.md`](../prd/prd-pull-demo-3acts.md). Setup: [`SETUP.md`](SETUP.md).

```sh
export PATH="../.tools/node/bin:$PATH"
npm run dev
```

---

## ⚠ Before the audience (T-10 minutes)

1. **PRE-WARM TESSERACT — do this first.** The first OCR run downloads ~10 MB of English
   `traineddata` into the browser's IndexedDB. The E2E suite measured a **cold** 10-image import
   (Cloudinary uploads + browser OCR) at 3.7–4.3 s versus **2.4–2.9 s warm** on this machine — the
   download is small on good Wi-Fi, but venue Wi-Fi can stretch it, so press the sample button once
   in advance rather than gambling on the first seconds of Act 1.
   - Open `/studio` → any job → import panel → **Use the 10 sample looks** → wait for the first
     tile to say **READY** (or for all 10) → **Clear** (or reset the job afterwards).
   - The worker and language data are now cached in that browser profile. Do not use a fresh
     incognito window for the demo itself.
2. **Preflight.** `npm run demo:check` (or `node scripts/demo-check.mjs`). It must end
   `READY`. The two expected warnings are:
   `! mail mode CAPTURED → …` (Resend is capturing to your inbox) and
   `! tracking webhook SHIPPO_WEBHOOK_SECRET is empty` — both are intentional in dev.
3. **Magic link.** `/login` → enter an allow-listed address → the link arrives in the allow-listed
   inbox (or `RESEND_REDIRECT_TO` if set). Until `viscosejournal.com` is verified, brands receive
   nothing; mail is captured for the demo.
4. **Cold start data.** For a clean run:
   ```sh
   npm run demo:reset -- --all --yes     # every job + its looks/boards/requests/emails/shipments/events
   npm run demo:seed                     # "Oscar campaign", call-in today, shoot +2d, return +10d
   ```
   `reset` keeps `users` and `contacts` (configuration). A fresh database has only the CELINE
   contact, so before Act 3 open `/studio/contacts` and press **Load 5 demo brands** (an idempotent
   upsert). That seed gives both shipping branches: CELINE and PRADA `showroom ships` (no intake
   link); BOTTEGA VENETA, JIL SANDER and LEMAIRE `need a label` (intake link + rates). To show the
   blocked path, approve a look for a house with no contact row — the requests page names it as
   "contact missing" rather than guessing an address.
5. **Shippo gate.** Leave `SHIPPO_ALLOW_PURCHASE=false`. Buying a label is deliberately blocked;
   you will demonstrate the gate on stage (see Act 3). Flipping it to `true` and clicking **Buy**
   spends real money on the Shippo account.
6. **Phone.** Client and intake links use `PUBLIC_BASE_URL`. Set it to this machine's LAN origin
   (`http://192.168.x.x:3000`) and open the demo on the same Wi-Fi, or present `/b/...` and
   `/i/...` on the laptop.

If something looks off: `npm run check` explains each vendor, `npm run demo:check` explains the demo
state.

---

## Act 1 — the board (Cloudinary · tesseract.js · Neon · agent trace)

1. `/studio` → open the seeded job (or create one: five fields, the date rule is validated live).
2. Import panel → **Use the 10 sample looks** (or drag 1–40 jpg/png/webp ≤ 20 MB).
   - Expected: each tile shows upload %, then **READING CAPTION**, then **READY** with brand, season
     and "READ FROM IMAGE". The counter reads `10 READY`.
   - If one file fails, press **Retry** on that tile only — the others keep going (FR-2).
3. Press **Build boards · 10 looks**. No publishing happens here.
   - Expected: 5 brand boards (Celine, Bottega Veneta, Jil Sander, Lemaire, Prada), 10 looks, each
     board ordered by look number. An unknown brand would land on an **Unassigned** board, never an
     error (FR-5).
4. Open the agent trace on the job page.
   - Expected: 10 × `cloudinary.upload`, 10 × `cloudinary.trim` (result says
     `mode: "delivery-transform"` — the crop is a delivery transform, not a network call),
     10 × `tesseract.read` with the caption text + confidence, 10 × `agent.parse`, 1 × `agent.group`
     — each with the browser-measured duration (FR-23).
5. Review: edit a look number/season/brand inline; delete one look (it hides, recoverable until
   publish); add it back. Confidence and `read_source` are visible per look (FR-4, FR-6).
6. **Publish** → the client link appears. **Copy link** or **send it** through Resend.

Vendor calls on stage: Cloudinary signed direct upload + `e_trim` delivery transform · tesseract.js
worker in the browser · Neon boards/looks/events.

---

## Act 2 — the approval (client board · Resend · report)

1. Open the published `/b/{token}` link on the phone or in an incognito window — no login.
   Expected: dark, image-forward board grouped by brand.
2. Approve / pass looks, star the must-haves, leave a note. The sticky bar counts update
   ("n approved · n passed · n must-haves").
3. Open the summary (`/b/{token}/review`), check the preview, **submit**.
   Expected: the board locks with "submitted <time>"; further edits are rejected (FR-11).
4. Back in the studio: the job's report card shows counts, the priority shortlist and every note
   attached to its look (FR-12). The agent has drafted **one email per brand** from the approved
   looks, with the SHOOT DETAILS block and the ship-to address (FR-13; deterministic drafting runs
   immediately, AI polish is optional).
5. `/studio/jobs/{id}/requests`: edit a draft if you like (**Rewrite with AI** falls back to the
   deterministic template), **Approve**, then **Send**.
   Expected: email status goes to Sent; with capture on, it lands in the demo inbox with
   `[demo → real-brand-address]` in the subject. Every send is one `resend.send` trace step.

Vendor call on stage: Resend `/emails` · Neon `emails/events` · the public HMAC client link.

---

## Act 3 — intake, label, tracking (Shippo · Resend · webhook)

1. On the requests page, a `needs a label` brand shows its **INTAKE** link (`/i/{token}`). Open it on
   the phone.
2. Fill the parcel (L/W/H cm, kg), pickup address/contact, pickup date + window → **See shipping
   options**.
   - Expected: exactly 3 options with carrier, service, transit days and price, in the rate's own
     currency (EUR for FR-origin showrooms, USD for US — never a hard-coded `$`).
   - Nothing is bought on the intake page; the showroom only enters the parcel (FR-17, FR-18).
3. Back on the studio requests page, the **LABEL · SHIPPO** panel shows the same three options.
   - **Choose** a rate → chosen rate persists, amount shown.
   - The **Buy label — {amount} (spends money)** button is visually disabled while
     `SHIPPO_ALLOW_PURCHASE=false`. Say on stage: *"Rates are free; buying is disabled so nothing is
     charged. Here is the refusal in the trace."* The `shippo.label` trace step keeps Shippo's own
     message: `Live Shippo key: label purchases are disabled. Rates are free; set
     SHIPPO_ALLOW_PURCHASE=true to actually buy labels.`
   - To buy for real: set `SHIPPO_ALLOW_PURCHASE=true`, restart `npm run dev`, choose a rate and
     press the button. A live key charges the label; a `shippo_test_` key produces a test label.
4. Once a label exists, the panel shows the PDF link, tracking number and status.
   - **Reply with label** emails the PDF in the original brand thread (Resend) and sets the request
     to `label_sent`; a second send is blocked.
   - **Refresh tracking** polls Shippo; the `POST /api/webhooks/shippo` endpoint mirrors
     `track_updated` events by tracking number. Note: a **live** Shippo key rejects test-mode
     tracking numbers — demonstrate tracking with a real label, or by POSTing a `track_updated`
     payload to the webhook.

Vendor calls on stage: Shippo `/shipments` (rates), `/transactions` (gated buy), `/tracks` (refresh)
· tracking webhook · Resend (label reply with attachment) · Neon `shipments/emails/events`.

---

## Reset between runs

```sh
# one job: looks, boards, requests, emails, shipments, events, then the job
npm run demo:reset -- --job <job uuid>

# everything (refuses without --yes): the "run the demo twice" case
npm run demo:reset -- --all --yes

# also delete the job's Cloudinary originals under pull/jobs/<jobId>/
npm run demo:reset -- --job <job uuid> --media

# contacts are configuration; only an explicit full reset deletes them
npm run demo:reset -- --all --yes --with-contacts

# fresh demo job for a cold start (idempotent; no duplicate if it exists)
npm run demo:seed
npm run demo:check
```

Before the npm scripts are added, use `node scripts/reset-demo.mjs …`, `node scripts/seed-demo.mjs`,
`node scripts/demo-check.mjs`. Reset never touches `users`; the preflight tells you the job state.

---

## Five-line fallback if something fails live

1. The job page trace shows the exact failing step and the provider's own message — read that out.
2. Retry only that step: per-file **Retry** on the import, resubmit the intake, or the panel's own
   button. Never re-run the whole import mid-demo.
3. First OCR still downloading? Wait for the ~10 MB language data; the pre-warm exists for this.
4. Email not arriving? Check the capture inbox / `RESEND_REDIRECT_TO`, and the email row's status
   (`bounced` = Resend rejected it; fix the address or domain, then send again).
5. Broken state? Reset just this job (`--job <id>`), re-seed if needed, and start the act again —
   the fixture screenshots are local, so Act 1 only needs Cloudinary.

---

## Environment flags that change the demo

| Variable | Demo value | Effect |
| --- | --- | --- |
| `SHIPPO_ALLOW_PURCHASE` | `false` | Buy label blocked with Shippo's "purchases are disabled" message. `true` spends real money. |
| `RESEND_REDIRECT_TO` | set | Brand mail is captured to this inbox, subject prefixed `[demo → …]`. Unset for real sends (needs a verified domain). |
| `SHIPPO_WEBHOOK_SECRET` | empty | Unsigned tracking webhooks are accepted (dev only). Set it before deploy; the route then requires `?secret=` or `x-shippo-webhook-secret`. |
| `PUBLIC_BASE_URL` | LAN origin | Client/intake links open on a phone. Without it links point at localhost. |
| `AUTH_ALLOWED_EMAIL` | allow-list | Which inboxes can receive the magic link. |

---

## The fixture set

`public/fixtures/looks/*.png` is the PRD FR-4 acceptance set: 10 screenshots, 5 houses, 2 looks each.
The import panel's **Use the 10 sample looks** button serves it. `npm run ocr:check` proves the
extraction gate (10/10 look numbers, 10/10 seasons at last run) without a browser.
