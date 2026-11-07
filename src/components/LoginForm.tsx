"use client"

import { useActionState } from "react"
import { requestMagicLink, type LoginState } from "@/server/actions/auth"

/**
 * Sign in. The magic link is emailed; the demo's Resend account has no verified domain, so the
 * link reaches the allow-listed address only — which is the point: no passwords, no session on a
 * shared machine.
 */
export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState | null, FormData>(requestMagicLink, null)

  return (
    <form action={action} className="stack" style={{ marginTop: 28, maxWidth: 420 }}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@studio.com"
          disabled={pending}
        />
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>

      {state?.status === "sent" && (
        <p className="success" role="status" style={{ padding: 14 }}>
          <span className="tick" aria-hidden="true">
            ✓
          </span>
          <span style={{ marginLeft: 10 }}>{state.message}</span>
        </p>
      )}
      {state?.status === "error" && (
        <p role="alert" className="small" style={{ color: "var(--danger)" }}>
          {state.message}
        </p>
      )}

      <p className="small" style={{ color: "var(--muted-foreground-soft)" }}>
        One address can sign in to this demo. The link expires in 15 minutes.
      </p>
    </form>
  )
}
