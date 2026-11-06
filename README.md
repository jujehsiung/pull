# PULL demo — app

Next.js 16 · React 19 · Tailwind 4 · Drizzle + Neon · Cloudinary · Resend · Shippo.
The spec is [`../prd/prd-pull-demo-3acts.md`](../prd/prd-pull-demo-3acts.md); the stack walkthrough is
[`SETUP.md`](SETUP.md).

```sh
export PATH="../.tools/node/bin:$PATH"
npm run dev                              # http://localhost:3000
npm run check                            # which services are connected, step by step
npm run db:connect                       # Neon: connection string from the clipboard → push → verify
npm run media:test                       # Cloudinary: signed upload accepted + crop transform works
npm run mail:test -- you@yourdomain.com  # Resend: one real delivery, bypassing capture
npm run agent:check                      # inference backend reachable, no tokens spent
```

| Route | What |
| --- | --- |
| `/` | landing page |
| `/login` | magic-link sign in (allow-listed addresses only) |
| `/studio` | job list |
| `/studio/jobs/new` | new job — five fields, date rule validated live (FR-1) |
| `/studio/jobs/{id}` | job home: import, board grid, publish, client link, agent trace |
| `/b/{token}` | public client board — no session, no account (FR-7/FR-9) |
| `/setup` | live stack checklist (reads the server env) |
| `/trace` | agent trace — every tool call with args, result, duration, status |
| `/preview/client.html` | client board (desktop + mobile) |
| `/preview/showroom.html` | showroom intake (desktop + mobile) |
| `GET /api/agent/status` | which inference backend is active (read-only) |
| `POST /api/agent/draft-email` | draft one brand request email through the active provider |
| `npm run agent:check` | read-only inference check: keys present, DeepSeek reachable, ZooWork plan |

The agent is traced through `src/lib/agent/tracer.ts` → `events` table → `/trace` and the job page.
Nothing the agent does is silent (PRD §7.1, FR-23).
