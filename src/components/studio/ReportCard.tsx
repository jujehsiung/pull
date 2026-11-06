import type { ReviewReport } from "@/server/queries/report"

/**
 * FR-12: the report the stylist gets. Counts, the priority shortlist ordered 3 -> 1, every note
 * attached to its look and brand, and the submission time. This is the answer to "I get a report".
 */
export function ReportCard({
  report,
  submittedAt,
  locked,
  reopenAction,
}: {
  report: ReviewReport
  submittedAt: Date | null
  locked: boolean
  reopenAction?: React.ReactNode
}) {
  const decided = report.approved + report.passed

  return (
    <section className="card" style={{ padding: 22 }} aria-label="Client review report">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <p className="eyebrow">CLIENT REPORT</p>
        <span className="mono" style={{ color: "var(--muted-2)", fontSize: 10 }}>
          {submittedAt
            ? `SUBMITTED ${submittedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`
            : `${decided} OF ${decided + report.undecided} DECIDED`}
        </span>
      </div>

      <div className="stats" style={{ marginTop: 20, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <div className="stat">
          <div className="n">{report.approved}</div>
          <div className="l">approved</div>
        </div>
        <div className="stat">
          <div className="n">{report.passed}</div>
          <div className="l">passed</div>
        </div>
        <div className="stat">
          <div className="n">{report.mustHaves}</div>
          <div className="l">must-haves (2★+)</div>
        </div>
        <div className="stat">
          <div className="n">{report.brands.length}</div>
          <div className="l">brands to request</div>
        </div>
      </div>

      {report.shortlist.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <p className="eyebrow">PRIORITY SHORTLIST</p>
          <ol style={{ margin: "10px 0 0", paddingLeft: 18, columns: 2, columnGap: 28 }}>
            {report.shortlist.map((look) => (
              <li key={look.id} className="small" style={{ marginBottom: 6 }}>
                <span className="mono">
                  {look.brand} · LOOK {look.lookNo}
                </span>
                {look.priority ? <span style={{ color: "var(--accent)" }}> {"★".repeat(look.priority)}</span> : null}
              </li>
            ))}
          </ol>
        </div>
      )}

      {report.notes.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <p className="eyebrow">NOTES</p>
          <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 10 }}>
            {report.notes.map((note) => (
              <li key={note.id} className="small" style={{ borderLeft: "2px solid var(--line-strong)", paddingLeft: 12 }}>
                <span className="mono" style={{ color: "var(--muted-2)" }}>
                  {note.brand} · LOOK {note.lookNo} · {note.status}
                </span>
                <br />
                {note.note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.brands.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <p className="eyebrow">BRANDS AFFECTED</p>
          <div className="chips" style={{ marginTop: 10 }}>
            {report.brands.map((brand) => (
              <span key={brand.brand} className="chip">
                {brand.brand} · {brand.approved}
              </span>
            ))}
          </div>
        </div>
      )}

      {report.shortlist.length === 0 && report.notes.length === 0 && (
        <p className="small" style={{ marginTop: 18 }}>
          The client has not sent anything back yet.
        </p>
      )}

      {locked && reopenAction && <div style={{ marginTop: 24 }}>{reopenAction}</div>}
    </section>
  )
}
