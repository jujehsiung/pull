import { publishJobForm, sendClientLinkForm } from "@/server/actions/jobs"
import { CopyLinkButton } from "@/components/studio/CopyLinkButton"

/**
 * Publish, copy, send — as real forms, so they work without JavaScript and their server actions can
 * be exercised by a test that posts the form. FR-7: publishing mints (or re-uses) the client link.
 * FR-8: sending is one human press through Resend; nothing goes out on its own.
 */
export function JobToolbar({
  jobId,
  linkPath,
  banner,
}: {
  jobId: string
  linkPath: string | null
  banner?: { tone: "ok" | "error"; message: string } | null
}) {
  return (
    <section className="card" style={{ padding: 20 }} aria-label="Publish and share">
      <div className="row" style={{ justifyContent: "space-between", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow">CLIENT LINK</p>
          {linkPath ? (
            <a
              href={linkPath}
              className="mono"
              style={{ display: "inline-block", marginTop: 8, wordBreak: "break-all", color: "var(--ink)" }}
            >
              {linkPath}
            </a>
          ) : (
            <p className="small" style={{ marginTop: 8 }}>
              Not published yet. The board stays private until you publish it.
            </p>
          )}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {linkPath && <CopyLinkButton value={linkPath} />}
          <form action={publishJobForm}>
            <input type="hidden" name="jobId" value={jobId} />
            <button type="submit" className="btn btn-primary btn-sm">
              {linkPath ? "Republish" : "Publish board"}
            </button>
          </form>
        </div>
      </div>

      {linkPath && (
        <form action={sendClientLinkForm} className="row" style={{ marginTop: 16, gap: 8 }}>
          <input type="hidden" name="jobId" value={jobId} />
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="client-email">Send it to the client</label>
            <input id="client-email" name="to" type="email" required placeholder="client@example.com" />
          </div>
          <button type="submit" className="btn btn-ghost btn-sm">
            Send link
          </button>
        </form>
      )}

      {banner && (
        <p
          className="small"
          role={banner.tone === "error" ? "alert" : "status"}
          style={{ color: banner.tone === "error" ? "var(--danger)" : "var(--ok)", marginTop: 12 }}
        >
          {banner.message}
        </p>
      )}
    </section>
  )
}
