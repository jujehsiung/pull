/** Resend — request emails, the client link and the magic-link login. */
import { Resend } from "resend"
import { env, isAllowedEmail } from "./env"

export function resendConfigured(): boolean {
  return Boolean(env().RESEND_API_KEY)
}

function client() {
  const e = env()
  if (!e.RESEND_API_KEY) throw new Error("Resend is not connected — set RESEND_API_KEY (SETUP.md step 4)")
  return new Resend(e.RESEND_API_KEY)
}

export interface SendInput {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
  headers?: Record<string, string>
  attachments?: { filename: string; content: string }[]
}

export async function sendEmail(input: SendInput): Promise<{ id: string }> {
  const e = env()
  const addressedTo = Array.isArray(input.to) ? input.to : [input.to]
  const { to, subject, html, captured } = capture(addressedTo, input.subject, input.html)
  const { data, error } = await client().emails.send({
    from: input.from ?? e.RESEND_FROM ?? "PULL <onboarding@resend.dev>",
    to,
    subject,
    html,
    text: input.text,
    replyTo: input.replyTo,
    headers: input.headers,
    attachments: input.attachments,
  })
  if (error) throw new Error(`Resend: ${error.message}`)
  if (captured.length) console.info(`[mail] captured ${captured.join(", ")} → ${process.env.RESEND_REDIRECT_TO}`)
  return { id: data?.id ?? "" }
}

/**
 * Demo mail capture. Without a verified sending domain Resend's `onboarding@resend.dev` sender can
 * only reach the account owner's own address — every other recipient is a hard 403.
 *
 * With RESEND_REDIRECT_TO set, any message addressed to someone other than the allow-listed stylist
 * is delivered to that one inbox instead, with the real recipients moved into the subject. Act 2's
 * request emails can then be read for real before a domain exists. Mail to the stylist is untouched,
 * so magic-link login still lands in the right inbox. Never set this when sending for real.
 */
function capture(addressedTo: string[], subject: string, html: string) {
  const redirectTo = process.env.RESEND_REDIRECT_TO?.trim()
  if (!redirectTo) return { to: addressedTo, subject, html, captured: [] as string[] }
  const captured = addressedTo.filter((address) => !isAllowedEmail(address))
  if (!captured.length) return { to: addressedTo, subject, html, captured }
  return {
    to: [redirectTo],
    subject: `[demo → ${captured.join(", ")}] ${subject}`,
    html: `${html}
      <hr style="border:0;border-top:1px solid #e7e4df;margin:20px 0">
      <p style="font-family:ui-monospace,monospace;font-size:11px;line-height:1.6;color:#8f8b85">
        Captured by the PULL demo. In production this would go to: ${captured.join(", ")}.
        Unset RESEND_REDIRECT_TO to send for real.
      </p>`,
    captured,
  }
}

export async function listDomains(): Promise<{ name: string; status: string }[]> {
  const e = env()
  const res = await fetch("https://api.resend.com/domains", {
    headers: { authorization: `Bearer ${e.RESEND_API_KEY}` },
  })
  if (!res.ok) throw new Error(`Resend domains: ${res.status}`)
  const body = (await res.json()) as { data?: { name: string; status: string }[] }
  return body.data ?? []
}

/** One template for the demo; later per-brand templates live in the agent. */
export function magicLinkEmail(url: string): { subject: string; html: string } {
  return {
    subject: "Your PULL sign-in link",
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:520px">
        <p style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.16em;color:#6b6a66">PULL</p>
        <h1 style="font-size:22px;letter-spacing:-.02em">Sign in</h1>
        <p style="color:#2c2c2b">This link signs you in to the PULL studio for 15 minutes.</p>
        <p><a href="${url}" style="display:inline-block;background:#0a0a0a;color:#f9f9f8;padding:12px 20px;border-radius:999px;text-decoration:none">Open PULL</a></p>
        <p style="color:#8f8b85;font-size:12px">If you didn't request this, ignore it.</p>
      </div>`,
  }
}
