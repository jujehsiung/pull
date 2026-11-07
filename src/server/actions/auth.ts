/**
 * Sign-in actions. One allow-listed stylist, magic link through Resend, 15-minute token.
 * PRD §13: all /studio routes require a session; nothing here leaks whether an address exists
 * beyond the demo's own allow-list, which is explicitly configured.
 */
"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { createMagicToken, endSession } from "@/lib/auth"
import { magicLinkEmail, sendEmail } from "@/lib/resend"
import { env, isAllowedEmail } from "@/lib/env"

export interface LoginState {
  status: "idle" | "sent" | "error"
  message?: string
}

export async function requestMagicLink(_prev: LoginState | null, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "error", message: "Enter an email address." }
  if (!isAllowedEmail(email)) {
    return { status: "error", message: "That address is not on this demo's allow-list." }
  }

  const token = createMagicToken(email)
  const url = `${await origin()}/api/auth/callback?token=${encodeURIComponent(token)}`
  const { subject, html } = magicLinkEmail(url)

  try {
    await sendEmail({ to: email, subject, html, text: `Sign in to Pull (15 minutes): ${url}` })
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Resend rejected the email." }
  }

  return { status: "sent", message: `Link sent to ${email}. It expires in 15 minutes.` }
}

export async function signOut(): Promise<void> {
  await endSession()
  redirect("/login")
}

/** Absolute origin for a mailed link: PUBLIC_BASE_URL when set (so a phone can open it), else the request. */
async function origin(): Promise<string> {
  const configured = env().PUBLIC_BASE_URL
  if (configured) return configured.replace(/\/$/, "")
  const h = await headers()
  const host = h.get("host") ?? "localhost:3000"
  return `${h.get("x-forwarded-proto") ?? "http"}://${host}`
}
