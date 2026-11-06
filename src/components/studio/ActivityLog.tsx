/**
 * FR-22 — the job's activity log, newest first. One card on the job page that shows what the agent
 * did and what the humans did in the same timeline: the agent trace panel filters to `actor =
 * 'agent'`, so without this the stylist's publish/edit/send actions are invisible.
 *
 * Summaries come from `getActivity` (human sentences, errors verbatim). This component only lays
 * them out: time, actor word (never colour alone), summary, raw kind in small mono. 375px-safe —
 * the summary column is `minmax(0, 1fr)` and wraps.
 */
import { getActivity } from "@/server/queries/activity"

const ACTOR_LABEL: Record<string, string> = {
  agent: "AGENT",
  stylist: "STYLIST",
  client: "CLIENT",
}

function actorColour(actor: string): string {
  if (actor === "agent") return "var(--accent)"
  if (actor === "client") return "var(--ok)"
  return "var(--ink-2)"
}

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })

function timeLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const time = TIME.format(date)
  return sameDay ? time : `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")} ${time}`
}

function plural(value: number, singular: string): string {
  return `${value} ${singular}${value === 1 ? "" : "s"}`
}

export async function ActivityLog({ jobId }: { jobId: string }) {
  const { rows, counts } = await getActivity(jobId)

  const header = [
    plural(counts.total, "action"),
    counts.cropped ? `${counts.cropped} cropped` : "",
    counts.readFromImage ? `${counts.readFromImage} read from image` : "",
    counts.emailsSent ? `${plural(counts.emailsSent, "email")} sent` : "",
    counts.failed ? `${counts.failed} failed` : "",
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <section className="card" style={{ padding: 20 }} aria-label="Activity log">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <p className="eyebrow">ACTIVITY</p>
        <span className="mono" style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--muted-2)" }}>
          {header}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="small" style={{ marginTop: 14 }}>
          Nothing yet — the agent&apos;s steps and your edits appear here as you work.
        </p>
      ) : (
        <ol style={{ listStyle: "none", margin: "16px 0 0", padding: 0 }}>
          {rows.map((row) => (
            <li
              key={row.id}
              style={{
                display: "grid",
                gridTemplateColumns: "52px minmax(0, 1fr)",
                gap: 10,
                padding: "9px 0",
                borderTop: "1px solid var(--line)",
              }}
            >
              <span
                className="mono"
                style={{ fontSize: 10, color: "var(--muted-2)", fontVariantNumeric: "tabular-nums" }}
              >
                {timeLabel(row.at)}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
                  <span
                    className="mono"
                    style={{ fontSize: 9, letterSpacing: ".1em", color: actorColour(row.actor), flex: "none" }}
                  >
                    {ACTOR_LABEL[row.actor] ?? row.actor.toUpperCase()}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      lineHeight: 1.45,
                      color: row.error ? "var(--danger)" : "var(--ink-2)",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {row.summary}
                  </span>
                </div>
                <span
                  className="mono"
                  style={{ display: "block", marginTop: 2, fontSize: 9, color: "var(--muted-2)", letterSpacing: ".04em" }}
                >
                  {row.kind}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="small" style={{ marginTop: 14, color: "var(--muted-2)" }}>
        Newest first · agent and human actions in one timeline (FR-22).
      </p>
    </section>
  )
}
