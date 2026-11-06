/**
 * Per-look review controls (FR-10): approve / pass toggle, 1–3 priority stars on approved looks, and
 * a note field. One server action per control; each click persists immediately and the board
 * re-renders from the DB (the action result is the source of truth).
 *
 * Progressive enhancement: the forms post to server actions directly, so the review still works
 * with JavaScript disabled (and can be exercised with curl). With JavaScript, the submit is
 * intercepted inside a transition so the decision and stars update optimistically while the action
 * is in flight; the intervening server render then replaces the optimistic value with the DB value.
 */
"use client"

import { useOptimistic, useState, useTransition } from "react"
import type { FormEvent, KeyboardEvent } from "react"
import { useFormStatus } from "react-dom"
import {
  setLookDecisionForm,
  setLookPriorityForm,
  setLookNoteForm,
} from "@/server/actions/review"
import type { LookCardLook, LookStatus } from "./types"
import styles from "./client-board.module.css"

interface ReviewState {
  status: LookStatus
  priority: number | null
}

function NoteSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={styles.noteSave} disabled={pending || disabled}>
      {pending ? "…" : "save"}
    </button>
  )
}

export function LookReviewControls({ token, look }: { token: string; look: LookCardLook }) {
  const [optimistic, setOptimistic] = useOptimistic<ReviewState, Partial<ReviewState>>(
    { status: look.status, priority: look.priority },
    (state, patch) => ({ ...state, ...patch }),
  )
  const [pending, startTransition] = useTransition()
  const [noteDirty, setNoteDirty] = useState(false)

  function decide(status: LookStatus, priority: number | null) {
    const data = new FormData()
    data.set("token", token)
    data.set("lookId", look.id)
    data.set("status", status)
    startTransition(async () => {
      setOptimistic({ status, priority })
      await setLookDecisionForm(data)
    })
  }

  function onSubmitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const status = String(data.get("status") ?? "")
    if (status !== "approved" && status !== "passed" && status !== "draft") return
    startTransition(async () => {
      setOptimistic({ status, ...(status === "approved" ? {} : { priority: null }) })
      await setLookDecisionForm(data)
    })
  }

  function onSubmitPriority(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const raw = String(data.get("priority") ?? "")
    const priority = raw === "" ? null : Number(raw)
    if (priority !== null && priority !== 1 && priority !== 2 && priority !== 3) return
    startTransition(async () => {
      setOptimistic({ priority })
      await setLookPriorityForm(data)
    })
  }

  /** Desktop convenience from the PRD: ← passes, → approves while a look's controls have focus. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    const target = event.target as HTMLElement
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
    event.preventDefault()
    const status: LookStatus = event.key === "ArrowRight" ? "approved" : "passed"
    decide(status, status === "approved" ? optimistic.priority : null)
  }

  return (
    <div
      className={styles.review}
      role="group"
      aria-label={`review look ${look.lookNo}`}
      aria-busy={pending}
      onKeyDown={onKeyDown}
    >
      <span className={styles.srOnly}>press arrow left to pass, arrow right to approve</span>

      <div className={styles.reviewRow}>
        <form action={setLookDecisionForm} onSubmit={onSubmitDecision} className={styles.reviewForm}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="lookId" value={look.id} />
          <input type="hidden" name="status" value={optimistic.status === "passed" ? "draft" : "passed"} />
          <button
            type="submit"
            className={`${styles.reviewBtn} ${styles.reviewBtnPass}`}
            aria-pressed={optimistic.status === "passed"}
            aria-label={`${optimistic.status === "passed" ? "undo pass on" : "pass"} look ${look.lookNo}`}
            disabled={pending}
          >
            ✕ pass
          </button>
        </form>

        <form action={setLookDecisionForm} onSubmit={onSubmitDecision} className={styles.reviewForm}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="lookId" value={look.id} />
          <input
            type="hidden"
            name="status"
            value={optimistic.status === "approved" ? "draft" : "approved"}
          />
          <button
            type="submit"
            className={`${styles.reviewBtn} ${styles.reviewBtnApprove}`}
            aria-pressed={optimistic.status === "approved"}
            aria-label={`${optimistic.status === "approved" ? "undo approval of" : "approve"} look ${look.lookNo}`}
            disabled={pending}
          >
            ✓ approve
          </button>
        </form>
      </div>

      {optimistic.status === "approved" ? (
        <div className={styles.starsRow} role="group" aria-label={`priority for look ${look.lookNo}`}>
          {[1, 2, 3].map((stars) => (
            <form
              key={stars}
              action={setLookPriorityForm}
              onSubmit={onSubmitPriority}
              className={styles.starForm}
            >
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="lookId" value={look.id} />
              <input
                type="hidden"
                name="priority"
                value={optimistic.priority === stars ? "" : String(stars)}
              />
              <button
                type="submit"
                className={styles.starBtn}
                aria-pressed={(optimistic.priority ?? 0) >= stars}
                aria-label={`${stars} ${stars === 1 ? "star" : "stars"}${
                  optimistic.priority === stars ? " — clear" : ""
                }`}
                disabled={pending}
              >
                ★
              </button>
            </form>
          ))}
        </div>
      ) : null}

      <form action={setLookNoteForm} className={styles.noteForm}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="lookId" value={look.id} />
        <input
          name="note"
          defaultValue={look.clientNote ?? ""}
          maxLength={2000}
          placeholder="note for Juje"
          aria-label={`note for look ${look.lookNo}`}
          className={styles.noteInput}
          onChange={() => setNoteDirty(true)}
        />
        <NoteSubmit disabled={pending || !noteDirty} />
      </form>

      <p className={styles.srOnly} role="status">
        {pending ? "saving your decision" : ""}
      </p>
    </div>
  )
}
