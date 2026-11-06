/**
 * Absolute URLs for things we hand to other people (client board, showroom intake).
 * PUBLIC_BASE_URL is the LAN/vercel origin in .env.local; falling back to the request origin is what
 * makes a mailed link open correctly on a second device instead of pointing at localhost.
 */
import { env } from "@/lib/env"

export function publicBoardPath(token: string): string {
  return `${base()}/b/${token}`
}

export function publicIntakePath(token: string): string {
  return `${base()}/i/${token}`
}

function base(): string {
  return (env().PUBLIC_BASE_URL ?? "").replace(/\/$/, "")
}
