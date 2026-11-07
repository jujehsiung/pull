import Link from "next/link"
import { notFound } from "next/navigation"
import { requireStylist } from "@/lib/auth"
import { getJob } from "@/server/queries/jobs"
import { getRequestsView } from "@/server/queries/requests"
import { publicIntakePath } from "@/lib/share"
import { LabelPanel } from "@/components/studio/LabelPanel"
import {
  approveDraftForm,
  draftNowForm,
  polishDraftForm,
  saveDraftForm,
  sendAllApprovedForm,
  sendDraftForm,
} from "@/server/actions/requests"

export const metadata = { title: "PULL — requests" }

const MODE_LABEL: Record<string, string> = {
  showroom_ships: "showroom ships",
  needs_label: "needs a label",
  unknown: "unknown",
}

const EMAIL_STATUS: Record<string, string> = {
  draft: "Draft",
  queued: "Approved",
  sent: "Sent",
  delivered: "Delivered",
  bounced: "Bounced",
  complained: "Complained",
}

export default async function RequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const stylist = await requireStylist()
  const { id } = await params
  const query = await searchParams
  const job = await getJob(stylist.id, id)
  if (!job) notFound()

  const { requests, missingContacts } = await getRequestsView(stylist.id, id)
  const approvedCount = requests.filter((row) => row.email?.status === "queued").length
  const sentCount = requests.filter((row) => row.email?.status === "sent").length

  const banner = query.error
    ? { tone: "error" as const, text: query.error }
    : query.sent
      ? { tone: "ok" as const, text: `${query.sent} request email${query.sent === "1" ? "" : "s"} sent.` }
      : query.drafted
        ? { tone: "ok" as const, text: `${query.drafted} draft${query.drafted === "1" ? "" : "s"} written.` }
        : query.polished
          ? { tone: "ok" as const, text: `Rewritten with ${query.polished}.` }
          : query.saved
            ? { tone: "ok" as const, text: "Draft saved." }
            : query.approved
              ? { tone: "ok" as const, text: "Draft approved." }
              : query.note
                ? { tone: "ok" as const, text: query.note }
                : null

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link href={`/studio/jobs/${job.id}`} className="mono" style={{ color: "var(--muted-foreground)" }}>
          ← {job.title}
        </Link>
        <header className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", marginTop: 14 }}>
          <div>
            <p className="eyebrow">Requests</p>
            <h1 className="display" style={{ margin: "10px 0 0", fontSize: "clamp(26px, 3.6vw, 38px)" }}>
              One email per brand
            </h1>
          </div>
          <span className="mono" style={{ color: "var(--muted-foreground-soft)", fontSize: 10 }}>
            {requests.length} BRANDS · {approvedCount} APPROVED · {sentCount} SENT
          </span>
        </header>
      </div>

      {banner && (
        <p
          className="small"
          role={banner.tone === "error" ? "alert" : "status"}
          style={{ color: banner.tone === "error" ? "var(--danger)" : "var(--ok)" }}
        >
          {banner.text}
        </p>
      )}

      {requests.length === 0 ? (
        <section className="card" style={{ padding: 24 }}>
          <p className="lead" style={{ margin: 0 }}>
            Draft one email per brand from the client&apos;s approved looks. Nothing is sent until you
            approve a draft and press send.
          </p>
          <form action={draftNowForm} style={{ marginTop: 18 }}>
            <input type="hidden" name="jobId" value={job.id} />
            <button type="submit" className="btn btn-primary">
              Draft requests
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="row" style={{ gap: 10, justifyContent: "space-between" }}>
            <p className="small" style={{ margin: 0 }}>
              {missingContacts.length
                ? `Blocked: no contact for ${missingContacts.join(", ")}. Add them in Contacts before approving.`
                : "Every brand has a resolved contact."}
            </p>
            <div className="row" style={{ gap: 8 }}>
              <form action={draftNowForm}>
                <input type="hidden" name="jobId" value={job.id} />
                <button type="submit" className="btn btn-ghost btn-sm">
                  Refresh unsent drafts
                </button>
              </form>
              <form action={sendAllApprovedForm}>
                <input type="hidden" name="jobId" value={job.id} />
                <button type="submit" className="btn btn-primary btn-sm" disabled={approvedCount === 0}>
                  Send {approvedCount || ""} approved
                </button>
              </form>
            </div>
          </section>

          {requests.map((request) => (
            <section key={request.id} className="card" style={{ padding: 20 }} aria-label={`${request.brand} request`}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                <div>
                  <p className="brand-name" style={{ margin: 0 }}>
                    {request.brand}
                  </p>
                  <span className="mono" style={{ color: "var(--muted-foreground-soft)", fontSize: 10 }}>
                    {MODE_LABEL[request.shippingMode] ?? request.shippingMode}
                    {request.email?.toEmail ? ` · ${request.email.toEmail}` : " · Contact missing"}
                    {request.status === "sent" ? " · REQUEST SENT" : ""}
                  </span>
                </div>
                <span className="chip">{EMAIL_STATUS[request.email?.status ?? "draft"] ?? request.email?.status}</span>
              </div>

              {request.intakeToken && request.shippingMode === "needs_label" && (
                <p className="mono" style={{ marginTop: 10, wordBreak: "break-all", color: "var(--muted-foreground)" }}>
                  INTAKE {publicIntakePath(request.intakeToken)}
                </p>
              )}

              {request.email && (
                <>
                  <form action={saveDraftForm} className="stack" style={{ gap: 12, marginTop: 16 }}>
                    <input type="hidden" name="emailId" value={request.email.id} />
                    <div className="field">
                      <label htmlFor={`subject-${request.id}`}>Subject</label>
                      <input
                        id={`subject-${request.id}`}
                        name="subject"
                        defaultValue={request.email.subject}
                        disabled={request.email.status === "sent"}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`body-${request.id}`}>Body</label>
                      <textarea
                        id={`body-${request.id}`}
                        name="body"
                        defaultValue={request.email.body}
                        rows={14}
                        disabled={request.email.status === "sent"}
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 12,
                          lineHeight: 1.5,
                          padding: 12,
                          border: "1px solid var(--line)",
                          borderRadius: 10,
                          background: "var(--card)",
                          color: "var(--ink)",
                        }}
                      />
                    </div>
                    {request.email.status !== "sent" && (
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                        <button type="submit" className="btn btn-ghost btn-sm">
                          Save draft
                        </button>
                      </div>
                    )}
                  </form>

                  {request.email.status !== "sent" && (
                    <div className="row" style={{ gap: 8, marginTop: 12 }}>
                      <form action={approveDraftForm}>
                        <input type="hidden" name="emailId" value={request.email.id} />
                        <button
                          type="submit"
                          className="btn btn-ghost btn-sm"
                          disabled={!request.email.toEmail || request.email.status === "queued"}
                        >
                          {request.email.status === "queued" ? "Approved" : "Approve"}
                        </button>
                      </form>
                      <form action={polishDraftForm}>
                        <input type="hidden" name="emailId" value={request.email.id} />
                        <button type="submit" className="btn btn-ghost btn-sm">
                          Rewrite with AI
                        </button>
                      </form>
                      <form action={sendDraftForm}>
                        <input type="hidden" name="emailId" value={request.email.id} />
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          disabled={request.email.status !== "queued"}
                        >
                          Send this one
                        </button>
                      </form>
                    </div>
                  )}

                  {request.email.status === "sent" && (
                    <p className="small" style={{ marginTop: 12, color: "var(--ok)" }}>
                      Sent{" "}
                      {request.email.sentAt ? `${request.email.sentAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}
                      {request.email.resendId ? ` · Resend ${request.email.resendId.slice(0, 8)}…` : ""}
                    </p>
                  )}
                </>
              )}
              <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 18 }}>
                <LabelPanel requestId={request.id} />
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
