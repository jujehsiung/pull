import Link from "next/link"
import { requireStylist } from "@/lib/auth"
import { listJobs } from "@/server/queries/jobs"

export const metadata = { title: "PULL — dashboard" }

const STATUS: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  client_reviewed: "Client reviewed",
  requests_drafted: "Requests drafted",
  requests_sent: "Requests sent",
  shipping: "Shipping",
  complete: "Complete",
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

export default async function DashboardPage() {
  const stylist = await requireStylist()
  const jobs = await listJobs(stylist.id)

  return (
    <div>
      <header className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <p className="eyebrow">DASHBOARD</p>
          <h1 className="display" style={{ margin: "12px 0 0", fontSize: "clamp(30px, 4vw, 44px)" }}>
            Your jobs
          </h1>
        </div>
        <Link href="/studio/jobs/new" className="btn btn-primary">
          Start a job
        </Link>
      </header>

      {jobs.length === 0 ? (
        <div className="card" style={{ marginTop: 28, padding: 28 }}>
          <p className="lead" style={{ margin: 0 }}>
            No jobs yet. Start one, drop in the look screenshots, and the agent sorts them for you.
          </p>
          <Link href="/studio/jobs/new" className="btn btn-primary" style={{ marginTop: 18 }}>
            Start a job
          </Link>
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "28px 0 0", display: "grid", gap: 12 }}>
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/studio/jobs/${job.id}`}
                className="card"
                style={{ display: "block", padding: 20, textDecoration: "none", color: "inherit" }}
              >
                <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <span className="mono" style={{ color: "var(--muted-2)" }}>
                      {job.clientName.toUpperCase()}
                    </span>
                    <h2 className="h3" style={{ margin: "6px 0 0" }}>
                      {job.title}
                    </h2>
                    <p className="small" style={{ margin: "6px 0 0" }}>
                      {job.clientEmail ?? "No contact email"} · {formatDate(job.shootDate)}
                    </p>
                  </div>
                  <span className="chip">{STATUS[job.status] ?? job.status}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
