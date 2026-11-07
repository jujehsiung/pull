import { chromium } from "@playwright/test"
const b = await chromium.launch({ channel: "chrome" })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", deviceScaleFactor: 2 })
await p.route("**://fonts.googleapis.com/**", (r) => r.abort())
await p.route("**://fonts.gstatic.com/**", (r) => r.abort())
await p.goto("http://localhost:3000/client", { waitUntil: "domcontentloaded", timeout: 60000 })
await p.waitForTimeout(1400)
const fig = p.locator(".board-grid figure").first()
const fb = await fig.boundingBox()
await p.mouse.move(fb.x + 40, fb.y + 40); await p.waitForTimeout(300)
await fig.locator('button[aria-label*="Mark up pieces"]').click()
await p.waitForTimeout(800)
const cb = await p.locator("canvas[aria-label='Markup canvas']").boundingBox()
// ring around the jacket, and a small one around the bag, like a marker would
const ring = async (fx, fy, fr) => {
  const cx = cb.x + cb.width * fx, cy = cb.y + cb.height * fy, r = Math.min(cb.width, cb.height) * fr
  await p.mouse.move(cx + r, cy); await p.mouse.down()
  for (let i = 0; i <= 44; i++) { const a = (i / 44) * Math.PI * 2; await p.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r) }
  await p.mouse.up(); await p.waitForTimeout(200)
}
await ring(0.52, 0.42, 0.22)
await ring(0.4, 0.55, 0.09)
await p.waitForTimeout(300)
const dlg = await p.locator('[role="dialog"]').boundingBox()
await p.screenshot({ path: "/tmp/t-markup-green.png", clip: { x: Math.round(dlg.x) - 8, y: Math.round(dlg.y) - 8, width: Math.round(dlg.width) + 16, height: Math.round(dlg.height) + 16 }, animations: "disabled" })
await b.close()
