"use client"

import { useActionState } from "react"
import { createSimpleJob, type ActionResult } from "@/server/actions/jobs"

/** Four fields. Job name, client, contact email, job date. Nothing else. */
export function NewJobForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createSimpleJob, null)

  return (
    <form action={action} className="card stack" style={{ marginTop: 24, padding: 24, gap: 16 }}>
      <div className="field">
        <label htmlFor="title">Job name</label>
        <input id="title" name="title" required placeholder="Oscar campaign" autoFocus />
      </div>

      <div className="field">
        <label htmlFor="clientName">Client</label>
        <input id="clientName" name="clientName" required placeholder="Timothée Chalamet" />
      </div>

      <div className="field">
        <label htmlFor="clientEmail">Contact email</label>
        <input id="clientEmail" name="clientEmail" type="email" required placeholder="client@example.com" />
      </div>

      <div className="field">
        <label htmlFor="jobDate">Job date</label>
        <input id="jobDate" name="jobDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
      </div>

      {state?.error && (
        <p className="small" role="alert" style={{ color: "var(--danger)", margin: 0 }}>
          {state.error}
        </p>
      )}

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 4 }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  )
}
