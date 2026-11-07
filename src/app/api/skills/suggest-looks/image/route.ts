/**
 * Same-origin image relay for researched looks.
 *
 * Vogue Runway serves collection photographs from assets.vogue.com without CORS headers. The board
 * crops every suggested look on a canvas before it is shown, and a cross-origin image would taint
 * that canvas — so the browser cannot read it back. This route fetches the photo on the server and
 * streams it from our own origin, which keeps the canvas clean and the provenance intact (the page
 * still links to the Vogue collection; only the pixels are relayed).
 *
 * Locked to the Vogue asset host on purpose: this is not an open proxy.
 */
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_HOSTS = ["assets.vogue.com"]

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("u")
  if (!raw) return NextResponse.json({ error: "Missing image URL." }, { status: 400 })

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return NextResponse.json({ error: "Invalid image URL." }, { status: 400 })
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.includes(target.hostname)) {
    return NextResponse.json({ error: "That host is not allowed." }, { status: 400 })
  }

  const upstream = await fetch(target, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      accept: "image/avif,image/webp,image/jpeg,image/*",
      referer: "https://www.vogue.com/",
    },
    cache: "force-cache",
  })

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `Vogue returned HTTP ${upstream.status}.` }, { status: 502 })
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg"
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Upstream did not return an image." }, { status: 502 })
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
    },
  })
}
