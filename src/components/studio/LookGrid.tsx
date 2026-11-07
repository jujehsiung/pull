"use client"

import { useState, useTransition } from "react"
import { setLookHiddenForm, updateLook } from "@/server/actions/jobs"

export interface LookView {
  id: string
  lookNo: number
  season: string | null
  brand: string
  readSource: string
  confidence: number | null
  imageUrl: string
}

export interface BoardView {
  id: string
  brand: string
  looks: LookView[]
}

const SOURCE_LABEL: Record<string, string> = {
  image: "read from image",
  filename: "from filename",
  sequence: "from sequence",
  manual: "edited",
}

/**
 * FR-4/FR-6: every look is editable inline and the edit persists; a look can be hidden and restored
 * until the job is published. Confidence is shown, never hidden — a filename guess looks different
 * from a read from the pixels.
 */
export function LookGrid({ jobId, boards, hidden }: { jobId: string; boards: BoardView[]; hidden: LookView[] }) {
  const [showHidden, setShowHidden] = useState(false)

  return (
    <div className="stack" style={{ gap: 28 }}>
      {boards.map((board) => (
        <section key={board.id} aria-label={board.brand}>
          <div className="row" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
            <h2 className="brand-name" style={{ margin: 0 }}>
              {board.brand}
            </h2>
            <span className="mono" style={{ color: "var(--muted-foreground-soft)" }}>
              {board.looks.length} LOOK{board.looks.length === 1 ? "" : "S"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 16, marginTop: 16 }}>
            {board.looks.map((look) => (
              <LookCard key={look.id} look={look} jobId={jobId} />
            ))}
          </div>
        </section>
      ))}

      {hidden.length > 0 && (
        <section>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowHidden((value) => !value)}>
            {showHidden ? "Hide" : `Show ${hidden.length} hidden look${hidden.length === 1 ? "" : "s"}`}
          </button>
          {showHidden && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 16, marginTop: 16 }}>
              {hidden.map((look) => (
                <LookCard key={look.id} look={look} jobId={jobId} isHidden />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function LookCard({ look, jobId, isHidden = false }: { look: LookView; jobId: string; isHidden?: boolean }) {
  const [draft, setDraft] = useState({
    lookNo: String(look.lookNo),
    brand: look.brand,
    season: look.season ?? "",
  })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const dirty =
    draft.lookNo !== String(look.lookNo) || draft.brand !== look.brand || draft.season !== (look.season ?? "")

  const save = () => {
    if (!dirty) return
    start(async () => {
      setError(null)
      const result = await updateLook({
        lookId: look.id,
        lookNo: Number.parseInt(draft.lookNo, 10),
        brand: draft.brand,
        season: draft.season || null,
      })
      if (!result.ok) {
        setError(result.error ?? "Could not save.")
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    })
  }

  return (
    <article className="card" style={{ padding: 10, opacity: pending ? 0.6 : 1 }} data-look={look.lookNo}>
      <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "var(--paper-2)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={look.imageUrl}
          alt={`Look ${look.lookNo}${look.season ? ` — ${look.season}` : ""}${look.brand ? `, ${look.brand}` : ""}`}
          width={600}
          height={800}
          loading="lazy"
          style={{ display: "block", width: "100%", height: "auto", aspectRatio: "3 / 4", objectFit: "cover" }}
        />
      </div>

      <div className="stack" style={{ gap: 8, marginTop: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <div className="field" style={{ width: 74 }}>
            <label htmlFor={`look-no-${look.id}`}>Look</label>
            <input
              id={`look-no-${look.id}`}
              value={draft.lookNo}
              onChange={(event) => setDraft((prev) => ({ ...prev, lookNo: event.target.value }))}
              onBlur={save}
              inputMode="numeric"
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 0 }}>
            <label htmlFor={`season-${look.id}`}>Season</label>
            <input
              id={`season-${look.id}`}
              value={draft.season}
              onChange={(event) => setDraft((prev) => ({ ...prev, season: event.target.value }))}
              onBlur={save}
              placeholder="AW26"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor={`brand-${look.id}`}>Brand</label>
          <input
            id={`brand-${look.id}`}
            value={draft.brand}
            onChange={(event) => setDraft((prev) => ({ ...prev, brand: event.target.value }))}
            onBlur={save}
          />
        </div>

        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="mono" style={{ fontSize: 10, color: look.readSource === "image" ? "var(--ok)" : "var(--muted-foreground-soft)" }}>
            {SOURCE_LABEL[look.readSource] ?? look.readSource}
            {look.confidence !== null ? ` · ${Math.round(Number(look.confidence))}%` : ""}
          </span>
          <form action={setLookHiddenForm}>
            <input type="hidden" name="lookId" value={look.id} />
            <input type="hidden" name="jobId" value={jobId} />
            <input type="hidden" name="hidden" value={isHidden ? "false" : "true"} />
            <button type="submit" className="btn btn-ghost btn-sm" disabled={pending} style={{ padding: "4px 10px" }}>
              {isHidden ? "Restore" : "Remove"}
            </button>
          </form>
        </div>

        {error && (
          <p className="small" role="alert" style={{ color: "var(--danger)", margin: 0 }}>
            {error}
          </p>
        )}
        {saved && (
          <p className="small" style={{ color: "var(--ok)", margin: 0 }}>
            Saved
          </p>
        )}
      </div>
    </article>
  )
}
