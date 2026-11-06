import { NextResponse } from "next/server"
import { consumeMagicToken, startSession } from "@/lib/auth"

/**
 * The magic link lands here: verify the signed token, open a session, go to the studio.
 * Failures go back to /login with a reason rather than a stack trace.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")
  const email = token ? consumeMagicToken(token) : null
  if (!email) {
    const url = new URL("/login", request.url)
    url.searchParams.set("error", "expired")
    return NextResponse.redirect(url)
  }
  await startSession(email)
  return NextResponse.redirect(new URL("/studio", request.url))
}
