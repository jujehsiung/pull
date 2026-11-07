import Link from "next/link"
import { serviceStatuses } from "@/lib/env"
import type { ServiceName } from "@/lib/env"

export const dynamic = "force-dynamic"

const STEPS: { step: string; title: string; service?: ServiceName; done?: boolean; detail: string; action: string }[] = [
  {
    step: "1",
    title: "App",
    done: true,
    detail: "Next.js 16 · React 19 · Tailwind 4 · TypeScript. Running locally and building clean.",
    action: "npm run dev",
  },
  {
    step: "2",
    title: "Neon — database",
    service: "Neon",
    detail: "Create a project, copy the pooled DATABASE_URL, then apply the schema.",
    action: "npm run db:push",
  },
  {
    step: "3",
    title: "Cloudinary — images & crop",
    service: "Cloudinary",
    detail: "Copy cloud name, API key and secret. The board crop is a Cloudinary transform.",
    action: "CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET",
  },
  {
    step: "4",
    title: "Resend — email",
    service: "Resend",
    detail: "API key plus a verified sending domain (or onboarding@resend.dev while testing).",
    action: "RESEND_API_KEY / RESEND_FROM",
  },
  {
    step: "5",
    title: "Shippo — labels",
    service: "Shippo",
    detail: "Start with a shippo_test_ key so the flow runs without spending money.",
    action: "SHIPPO_API_KEY",
  },
  {
    step: "6",
    title: "Auth secrets",
    service: "Auth secrets",
    detail: "AUTH_SECRET, LINK_SECRET and the one allow-listed email for the stylist.",
    action: "npm run check",
  },
]

export default function SetupPage() {
  const statuses = serviceStatuses()
  const configured = new Map(statuses.map((s) => [s.name, s]))
  // A chip is DONE when the service it describes reports configured — the page cannot disagree
  // with the LIVE STATUS list rendered below it.
  const isDone = (step: (typeof STEPS)[number]) =>
    step.done ?? (step.service ? Boolean(configured.get(step.service)?.configured) : false)

  return (
    <div className="container" style={{ paddingBottom: 80 }}>
      <div className="nav-inner" style={{ borderBottom: "1px solid var(--line)" }}>
        <Link className="wordmark" href="/">
          PULL
        </Link>
        <span className="mono" style={{ color: "var(--muted-foreground)", fontSize: 11, letterSpacing: ".14em" }}>
          STACK SETUP
        </span>
        <Link className="btn btn-ghost btn-sm" href="/trace">
          Agent trace demo
        </Link>
      </div>

      <header style={{ padding: "clamp(40px,6vw,72px) 0 8px" }}>
        <p className="eyebrow">ONE BY ONE</p>
        <h1 className="display" style={{ fontSize: "clamp(34px,4.8vw,56px)", marginTop: 14 }}>
          Connect the stack.
        </h1>
        <p className="lead" style={{ marginTop: 16, maxWidth: 620 }}>
          Each step is one service. Paste the keys into <span className="mono">.env.local</span>, run{" "}
          <span className="mono">npm run check</span>, and the step turns green. No step needs the one after it.
        </p>
      </header>

      <div className="grid two" style={{ marginTop: 36 }}>
        {STEPS.map((s) => (
          <article key={s.step} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="eyebrow">STEP {s.step}</span>
              <span
                className="chip"
                style={{
                  borderColor: isDone(s) ? "var(--ok)" : undefined,
                  color: isDone(s) ? "var(--ok)" : undefined,
                }}
              >
                {isDone(s) ? "DONE" : "TODO"}
              </span>
            </div>
            <h2 className="h3">{s.title}</h2>
            <p className="small">{s.detail}</p>
            <code
              className="mono"
              style={{ fontSize: 11, background: "var(--paper-2)", padding: "8px 10px", borderRadius: 8 }}
            >
              {s.action}
            </code>
          </article>
        ))}
      </div>

      <section className="card" style={{ marginTop: 24 }}>
        <p className="eyebrow">LIVE STATUS</p>
        <ul className="stack" style={{ gap: 8, marginTop: 12, padding: 0, listStyle: "none" }}>
          {statuses.map((s) => (
            <li key={s.name} className="row" style={{ justifyContent: "space-between" }}>
              <span>
                <span className="mono" style={{ fontSize: 11, border: "1px solid var(--line)", borderRadius: 6, padding: "2px 6px" }}>
                  {configured.get(s.name)?.configured ? "OK" : "—"}
                </span>{" "}
                {s.name}
              </span>
              <span className="small mono" style={{ fontSize: 11 }}>
                {s.variables.join(" · ")}
              </span>
            </li>
          ))}
        </ul>
        <p className="small" style={{ marginTop: 12 }}>
          This page reads the server environment. After editing <span className="mono">.env.local</span>,
          restart <span className="mono">npm run dev</span> and reload.
        </p>
      </section>
    </div>
  )
}
