# E2E — the three acts in one real browser

```sh
export PATH="../.tools/node/bin:$PATH"
npm run e2e            # = playwright test
# or: npx playwright test
```

This is the M4 gate: one Playwright spec that runs Acts 1–3 in sequence against the live dev server
(`http://localhost:3000`) and the real Neon / Cloudinary / Resend / Shippo / tesseract stack. It is
also the **only** place the browser tesseract worker is actually executed — the rest of the app's
tests prove parsing in Node, not the worker.

## No browser download

`playwright.config.ts` points `launchOptions.executablePath` at the installed Chromium-family
browser:

```
/Applications/Brave Browser.app/Contents/MacOS/Brave Browser
```

Do **not** run `npx playwright install`: it is unnecessary and downloads hundreds of MB. The spec
runs headless. If Brave moves, update the path in `playwright.config.ts`.

## Auth, and the point of the two contexts

- **Stylist** pages are opened in a context with the real `pull_session` cookie. `helpers.ts` mints it
  exactly like `src/lib/auth.ts`: HMAC-SHA256 over base64url(`{email, purpose:"session", exp}`) with
  `AUTH_SECRET` from `.env.local`, first allow-listed email. No magic-link inbox is needed.
- **Client board and showroom intake** are opened in a context with **no cookies at all**, and the
  spec asserts `context.cookies()` is empty. That contrast is the security property: public links
  must work without a session.

## What it proves

| Act | Steps | Vendors exercised |
| --- | --- | --- |
| 1 | create job → **Use the 10 sample looks** → wait for browser OCR → Build boards → 5 boards/10 looks ascending → edit season + reload → Publish → read client link | Cloudinary signed upload + trim, browser tesseract worker, Neon, server actions |
| 2 | cookie-free client link → approve two looks → 2★/3★ priority → note → hard reload (persistence) → summary → submit → locked board; stylist report counts match | HMAC public token, Neon review rows, server actions |
| 3 | seed 5 demo contacts (idempotent) → requests page draft refresh → 2 drafts, SHOOT DETAILS + ship-to, intake link only for the `needs_label` brand → cookie-free intake → **real Shippo quote** → 3 options → choose rate → buy button disabled → force-submit purchase → gate message, no label row | Shippo `/shipments`, Contacts seed, Neon shipments |

The spec creates its own job (unique client name) and resets it in `afterAll` via
`node scripts/reset-demo.mjs --job <id>`. It never touches the fixture job
`2d726bee-e9c9-487b-a6da-c410942d2adf`. The five-brand Contacts seed is an idempotent upsert, so
repeated runs are safe.

## Artifacts

- `e2e/artifacts/act1-board.png`, `act2-locked.png`, `act3-rates.png`, `act3-gated.png` are captured
  on every successful run.
- On failure Playwright adds a screenshot + trace under `e2e/artifacts/` (`only-on-failure`,
  `retain-on-failure`; video is off to avoid an ffmpeg download). Inspect a trace with
  `npx playwright show-trace e2e/artifacts/<test>/trace.zip`.

## Timings observed (honest numbers)

Each Playwright run uses a fresh browser profile, so the first import is a cold worker/traineddata
run. The spec measures it and, on a throwaway job in the same context, a warm run. Two consecutive
green runs measured:

```
run 1: [e2e] OCR cold 4.3 s · warm 2.9 s   (10 fixtures: Cloudinary uploads + browser tesseract worker)
run 2: [e2e] OCR cold 3.7 s · warm 2.4 s
```

The very first execution on a clean profile was 6.2 s cold. The console line plus the `ocr-timing`
test annotation carry the numbers. The demo pre-warm advice is about the **first traineddata
download** in the browser profile you will demo in, not about OCR being slow per fixture.

## Why this suite exists

Two real bugs were only visible in a browser:

1. **Brand casing**: imported looks are Title Case (`Celine`), the contacts seed is UPPERCASE
   (`CELINE`); requests matched contacts by exact string, so a freshly imported job produced
   "contact missing" drafts and no intake link. Fixed with the shared `brandKey()` helper.
2. **HTML `step` measured from `min`**: the intake weight input was `min=0.05 step=0.1`, which made
   the form's own default `1.2` client-side invalid — the submit never posted, so every server-side
   test passed. Fixed with `step=0.05`.

## Dev-server note

`webServer.reuseExistingServer: true` means the config uses the already-running `npm run dev` (the
normal demo setup) and only starts one if none is listening. If you edit app files while the suite
runs, Turbopack HMR can briefly outrun hydration; the spec settles the first studio page before
typing, but rerun if a click lands exactly on a rebuild.
