/**
 * Playwright config for the M4 acceptance run.
 *
 * No browser download: this machine has Brave, a Chromium-family browser, and Playwright can drive
 * it headless via `launchOptions.executablePath`. The dev server is normally already running (this
 * is a demo checkout); `reuseExistingServer` keeps the config safe either way.
 *
 * One worker: the spec is a single three-act story, and the demo database is shared state.
 */
import { existsSync } from "node:fs"
import { defineConfig } from "@playwright/test"

const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"

export default defineConfig({
  testDir: "./e2e",
  outputDir: "e2e/artifacts",
  // Act 1 waits on real uploads + the tesseract worker download; Act 3 on a real Shippo quote.
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    launchOptions: existsSync(BRAVE) ? { executablePath: BRAVE } : {},
    // Failure evidence lands in e2e/artifacts (screenshots, traces); no video (no ffmpeg download).
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
