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
  const configured = new Map(statuses.map((service) => [service.name, service]))
  const done = statuses.filter((service) => service.configured).length

  // A row is Done when the service it describes reports configured — the page cannot disagree
  // with the live status list rendered below it.
  const isDone = (step: (typeof STEPS)[number]) =>
    step.done ?? (step.service ? Boolean(configured.get(step.service)?.configured) : false)

  return (
    <main className="mx-auto max-w-[1440px] px-6 pb-20 md:px-10">
      <section className="border-b border-border py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[10px] tracking-[0.02em] text-muted-foreground">Setup</p>
            <h1 className="text-[clamp(30px,3.4vw,46px)] font-semibold leading-[0.95] tracking-[-0.035em] text-foreground">
              Connect the stack.
            </h1>
            <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-muted-foreground">
              For whoever deploys this — not a product screen. Each row is one service. Paste the keys into{" "}
              <code className="font-mono text-[12px] text-foreground">.env.local</code>, run{" "}
              <code className="font-mono text-[12px] text-foreground">npm run check</code>, and the row
              turns green. No row needs the one after it.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:ml-auto">
            <Link href="/trace" className="btn btn-ghost btn-sm">
              Agent trace
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-10 grid gap-x-8 gap-y-10 md:grid-cols-2">
        {STEPS.map((step) => {
          const complete = isDone(step)
          return (
            <article key={step.step} className="flex flex-col border-t border-border pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-[11px] tracking-[0.02em] text-muted-foreground-soft">
                  Step {step.step}
                </span>
                <span
                  className={`text-[11px] tracking-[0.02em] ${
                    complete ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  {complete ? "Done" : "To do"}
                </span>
              </div>
              <h2 className="mt-2 text-[18px] font-medium leading-snug tracking-[-0.01em] text-foreground">
                {step.title}
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{step.detail}</p>
              <code className="mt-3 block break-words border border-border bg-muted px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground">
                {step.action}
              </code>
            </article>
          )
        })}
      </div>

      <section className="mt-14 border-t border-border pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[11px] tracking-[0.02em] text-muted-foreground">Live status</p>
          <span className="font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
            {done}/{statuses.length} configured
          </span>
        </div>

        <ul className="mt-3 flex flex-col">
          {statuses.map((service) => (
            <li
              key={service.name}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border py-2.5"
            >
              <span className="flex items-baseline gap-2 text-[13px] text-foreground">
                <span
                  aria-hidden
                  className={`size-1.5 rounded-full ${service.configured ? "bg-success" : "bg-border"}`}
                />
                {service.name}
              </span>
              <span className="font-mono text-[10px] tracking-[0.02em] text-muted-foreground-soft">
                {service.variables.join(" · ")}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 max-w-[560px] text-[11px] leading-relaxed text-muted-foreground">
          This page reads the server environment. After editing{" "}
          <code className="font-mono text-foreground">.env.local</code>, restart{" "}
          <code className="font-mono text-foreground">npm run dev</code> and reload.
        </p>
      </section>
    </main>
  )
}
