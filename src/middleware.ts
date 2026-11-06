/**
 * Rate limiting for the two public link surfaces (PRD §13).
 *
 * `/b/{token}` is the client board and `/i/{token}` is the showroom intake — both are reachable
 * without a session, so they are the only routes an anonymous caller can hammer. Server actions
 * POST to these same paths, so the limit covers review mutations and intake submissions too.
 *
 * A 429 here is a plain response, not the app's 404: the difference matters when reading logs —
 * "too many requests" must never look like "invalid link".
 */
import { NextResponse, type NextRequest } from "next/server"
import { take } from "@/lib/rate-limit"

const WINDOW_MS = 60_000
// 30/min is the PRD target; dev is looser so a test loop or a teammate's verification run cannot
// trip the limit and burn ten minutes chasing a phantom bug. RATE_LIMIT_MAX overrides both.
const LIMIT = Number(process.env.RATE_LIMIT_MAX ?? (process.env.NODE_ENV === "production" ? 30 : 600))

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return request.headers.get("x-real-ip")?.trim() || "local"
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const scope = pathname.startsWith("/b/") ? "client" : pathname.startsWith("/i/") ? "intake" : null
  if (!scope) return NextResponse.next()

  const result = take(`${scope}:${clientIp(request)}`, LIMIT, WINDOW_MS)
  if (result.ok) return NextResponse.next()

  return new NextResponse("Too many requests — slow down and try again shortly.\n", {
    status: 429,
    headers: {
      "retry-after": String(result.retryAfterSeconds),
      "cache-control": "no-store",
    },
  })
}

export const config = {
  matcher: ["/b/:path*", "/i/:path*"],
}
