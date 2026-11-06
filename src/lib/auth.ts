/**
 * Auth — deliberately small for the demo: a magic link emailed through Resend, exchanged for an
 * HMAC-signed httpOnly cookie. One allow-listed stylist. No password, no user table on the hot path.
 *
 * (PRD §5 named Auth.js; we drop the beta dependency for the demo and keep the same flow.
 * Swap in Auth.js later without touching callers: getSession() / requireStylist() stay the same.)
 */
import { createHash, createHmac, timingSafeEqual, randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/db/client"
import { users } from "@/db/schema"
import { env, isAllowedEmail } from "./env"

const COOKIE = "pull_session"
const MAGIC_TTL = 60 * 15 // 15 minutes
const SESSION_TTL = 60 * 60 * 24 * 30 // 30 days

interface TokenPayload {
  email: string
  purpose: "login" | "session"
  exp: number
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

export function signToken(payload: TokenPayload): string {
  const secret = env().AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET is not set (SETUP.md step 6)")
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac("sha256", secret).update(body).digest("base64url")
  return `${body}.${sig}`
}

export function verifyToken(token: string | undefined): TokenPayload | null {
  const secret = env().AUTH_SECRET
  if (!token || !secret) return null
  const [body, sig] = token.split(".")
  if (!body || !sig) return null
  const expected = createHmac("sha256", secret).update(body).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function createMagicToken(email: string): string {
  return signToken({ email, purpose: "login", exp: Math.floor(Date.now() / 1000) + MAGIC_TTL })
}

export function consumeMagicToken(token: string): string | null {
  const payload = verifyToken(token)
  if (!payload || payload.purpose !== "login") return null
  if (!isAllowedEmail(payload.email)) return null
  return payload.email
}

export async function startSession(email: string): Promise<void> {
  const token = signToken({ email, purpose: "session", exp: Math.floor(Date.now() / 1000) + SESSION_TTL })
  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL,
  })
}

export async function endSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE)
}

export async function getSession(): Promise<{ email: string } | null> {
  const jar = await cookies()
  const payload = verifyToken(jar.get(COOKIE)?.value)
  if (!payload || payload.purpose !== "session") return null
  return { email: payload.email }
}

export function newSecret(): string {
  return randomBytes(32).toString("hex")
}

/**
 * Public link tokens (client board and showroom intake) — separate secret, separate scope,
 * so rotating LINK_SECRET revokes every shared link without logging the stylist out.
 */
export function signLink(payload: { scope: "client" | "intake"; id: string; exp: number }): string {
  const secret = env().LINK_SECRET
  if (!secret) throw new Error("LINK_SECRET is not set (SETUP.md step 6)")
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac("sha256", secret).update(body).digest("base64url")
  return `${body}.${sig}`
}

export function verifyLink(token: string): { scope: "client" | "intake"; id: string } | null {
  const secret = env().LINK_SECRET
  if (!secret) return null
  const [body, sig] = token.split(".")
  if (!body || !sig) return null
  const expected = createHmac("sha256", secret).update(body).digest("base64url")
  if (Buffer.from(sig).length !== Buffer.from(expected).length) return null
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      scope: "client" | "intake"
      id: string
      exp: number
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return { scope: payload.scope, id: payload.id }
  } catch {
    return null
  }
}

/**
 * Public links are handed out as tokens but stored as hashes, so a database dump does not grant
 * access to a client board. Same for the intake link (scope "intake", shorter life).
 */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function mintClientLink(jobId: string, days = 30): { token: string; hash: string } {
  const token = signLink({ scope: "client", id: jobId, exp: Math.floor(Date.now() / 1000) + days * 86_400 })
  return { token, hash: sha256(token) }
}

export function mintIntakeLink(requestId: string, days = 14): { token: string; hash: string } {
  const token = signLink({ scope: "intake", id: requestId, exp: Math.floor(Date.now() / 1000) + days * 86_400 })
  return { token, hash: sha256(token) }
}

/**
 * The stylist row for an allow-listed email, created on first sign-in.
 *
 * Upsert, not select-then-insert: a page and its layout both call requireStylist() in the same
 * render, so two requests race on the very first sign-in and the loser used to die on
 * users_email_unique. onConflictDoNothing makes the second one read instead of throw.
 */
async function ensureUser(email: string) {
  const [created] = await db()
    .insert(users)
    .values({ email, name: email.split("@")[0] })
    .onConflictDoNothing({ target: users.email })
    .returning()
  if (created) return created
  const [existing] = await db().select().from(users).where(eq(users.email, email)).limit(1)
  if (!existing) throw new Error("Could not resolve the stylist row for " + email)
  return existing
}

/** Session -> stylist row, or null. Safe in route handlers (no redirect). */
export async function getStylist(): Promise<{ id: string; email: string } | null> {
  const session = await getSession()
  if (!session || !isAllowedEmail(session.email)) return null
  const user = await ensureUser(session.email)
  return { id: user.id, email: user.email }
}

/** For pages and server actions: redirects to /login when there is no session. */
export async function requireStylist(): Promise<{ id: string; email: string }> {
  const stylist = await getStylist()
  if (!stylist) redirect("/login")
  return stylist
}
