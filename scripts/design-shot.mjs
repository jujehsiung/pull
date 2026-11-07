import { chromium } from "@playwright/test"

const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto("http://localhost:3000/design", { waitUntil: "networkidle", timeout: 90000 })

const tokens = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement)
  const names = ["--background","--foreground","--brand","--accent","--primary","--muted-foreground","--muted-foreground-soft","--dark","--radius","--font-sans"]
  const out = {}
  for (const n of names) out[n] = cs.getPropertyValue(n).trim()
  // Resolved paint, not just the variable: what the body actually renders.
  const body = getComputedStyle(document.body)
  out["body.bg"] = body.backgroundColor
  out["body.color"] = body.color
  out["body.font"] = body.fontFamily
  // A real utility: does bg-primary resolve to Pull ink?
  const btn = document.querySelector("button")
  out["firstButton.bg"] = btn ? getComputedStyle(btn).backgroundColor : "n/a"
  return out
})
console.log(JSON.stringify(tokens, null, 2))

await page.screenshot({ path: "/tmp/design-light.png", fullPage: false })
await page.evaluate(() => window.scrollTo(0, 2400))
await page.waitForTimeout(300)
await page.screenshot({ path: "/tmp/design-mid.png" })
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(300)
await page.screenshot({ path: "/tmp/design-dark.png" })
await browser.close()
console.log("screenshots written")
