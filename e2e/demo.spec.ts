/**
 * M4 acceptance — the three acts in one browser, end to end.
 *
 *   npx playwright test
 *
 * Act 1 (stylist, authenticated): create a job, import the 10 fixture screenshots through the real
 * browser tesseract worker, build 5 boards, edit a look, publish and read the client link.
 * Act 2 (client, NO cookie): approve / star / note, prove persistence across a hard reload, submit,
 * and prove the board locks and the stylist report matches.
 * Act 3 (stylist + showroom): seed the demo contacts, draft one request per approved brand, open the
 * intake link in a cookie-free context and get real Shippo rates, then prove the purchase gate is
 * closed and wrote no label.
 *
 * The test creates its own job and resets it in afterAll; the lead's fixture job is never touched.
 * Two consecutive `npx playwright test` runs must be green — that is the M4 gate.
 */
import { expect, test, type Locator, type Page } from "@playwright/test"
import {
  artifact,
  firstAllowedEmail,
  isoDate,
  publicContext,
  resetJob,
  shipmentForJob,
  stylistContext,
} from "./helpers"

/**
 * Click a review control and wait for its server action POST to come back before moving on.
 * Without this the next click (or a reload) can race the previous action and the DB never sees it.
 */
async function submitAction(page: Page, locator: Locator): Promise<void> {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.status() < 500,
    { timeout: 20_000 },
  )
  await locator.click()
  await responsePromise
}

// The acts share one job, one client link and one set of decisions.
test.describe.configure({ mode: "serial" })

let jobId = ""
let clientPath = ""
let ocrMs = 0

test.describe("PULL — three acts, end to end", () => {
  test.afterAll(() => {
    if (jobId) resetJob(jobId)
  })

  test("Act 1 — import, browser OCR, boards, publish", async ({ browser }) => {
    const context = await stylistContext(browser)
    const page = await context.newPage()

    const clientName = `E2E ${Date.now()}`
    await page.goto("/studio/jobs/new")
    // Turbopack dev hydration can lag a click that lands during an HMR rebuild; a short settle and
    // an explicit enabled check make the form submission deterministic without slowing the suite.
    await page.waitForLoadState("load")
    await page.waitForTimeout(400)
    await page.getByLabel("Client", { exact: true }).fill(clientName)
    await page.getByLabel("Job", { exact: true }).fill("E2E acceptance run")
    const createJob = page.getByRole("button", { name: "Create job" })
    await expect(createJob).toBeEnabled()
    await createJob.click()
    await page.waitForURL(/\/studio\/jobs\/[0-9a-f-]{36}/, { timeout: 60_000 })
    jobId = page.url().match(/\/studio\/jobs\/([0-9a-f-]{36})/)?.[1] ?? ""
    expect(jobId, "job id captured from the studio URL").not.toBe("")

    // The browser-only gap: real Cloudinary uploads + the real tesseract worker over 10 fixtures.
    const started = Date.now()
    await page.getByRole("button", { name: "Use the 10 sample looks" }).click()
    const buildButton = page.getByRole("button", { name: /Build boards/ })
    await expect(buildButton).toBeEnabled({ timeout: 150_000 })
    ocrMs = Date.now() - started
    console.log(`[e2e] sample import ready (uploads + tesseract worker) in ${(ocrMs / 1000).toFixed(1)} s`)
    test.info().annotations.push({
      type: "ocr-timing",
      description: `10 fixtures uploaded + OCR'd in ${(ocrMs / 1000).toFixed(1)} s (browser worker)`,
    })

    // Every fixture must have been read, not just a quorum.
    await expect(buildButton).toHaveText(/10 looks/)
    await buildButton.click()
    await expect(page.getByText("Boards built")).toBeVisible({ timeout: 30_000 })

    const brands = ["Bottega Veneta", "Lemaire", "Jil Sander", "Prada", "Celine"]
    for (const brand of brands) {
      await expect(page.locator(`section[aria-label="${brand}"]`)).toBeVisible({ timeout: 30_000 })
    }
    await expect(page.locator("article[data-look]")).toHaveCount(10)

    // FR-5: one board per brand, looks ascending inside each board.
    for (const brand of brands) {
      const numbers = await page
        .locator(`section[aria-label="${brand}"] article[data-look]`)
        .evaluateAll((cards) => cards.map((card) => Number(card.getAttribute("data-look"))))
      expect(numbers, `looks ascending in ${brand}`).toEqual([...numbers].sort((a, b) => a - b))
    }

    // FR-4/FR-6: inline edit persists across a reload.
    const celine = page.locator('section[aria-label="Celine"]')
    const lookCard = celine.locator('article[data-look="27"]')
    await lookCard.getByLabel("Season").fill("AW99")
    await lookCard.getByLabel("Season").press("Tab")
    await expect(lookCard.getByText("Saved")).toBeVisible({ timeout: 15_000 })
    await page.reload()
    await expect(page.locator('section[aria-label="Celine"] article[data-look="27"]').getByLabel("Season")).toHaveValue(
      "AW99",
    )

    // FR-7: publish and read the public link.
    await page.getByRole("button", { name: "Publish board" }).click()
    await page.waitForURL(/published=1/)
    const link = page.locator('section[aria-label="Publish and share"] a').first()
    await expect(link).toBeVisible()
    const href = await link.getAttribute("href")
    expect(href, "published client link").toBeTruthy()
    clientPath = new URL(href as string, "http://localhost:3000").pathname
    expect(clientPath).toMatch(/^\/b\//)

    await page.screenshot({ path: artifact("act1-board.png"), fullPage: false })

    // Cold vs warm OCR. The main import above is cold (fresh browser profile: worker + traineddata
    // download included). A throwaway job in the SAME context measures warm: the language data is
    // now in this origin's IndexedDB. The throwaway job is reset immediately; the fixture is safe.
    let warmMs: number | null = null
    try {
      const warmClient = `E2E warm ${Date.now()}`
      await page.goto("/studio/jobs/new")
      await page.waitForLoadState("load")
      await page.waitForTimeout(400)
      await page.getByLabel("Client", { exact: true }).fill(warmClient)
      await page.getByLabel("Job", { exact: true }).fill("Warm OCR measurement")
      await page.getByRole("button", { name: "Create job" }).click()
      await page.waitForURL(/\/studio\/jobs\/[0-9a-f-]{36}/, { timeout: 60_000 })
      const warmJobId = page.url().match(/\/studio\/jobs\/([0-9a-f-]{36})/)?.[1] ?? ""
      const warmStart = Date.now()
      await page.getByRole("button", { name: "Use the 10 sample looks" }).click()
      await expect(page.getByRole("button", { name: /Build boards/ })).toBeEnabled({ timeout: 150_000 })
      warmMs = Date.now() - warmStart
      if (warmJobId) resetJob(warmJobId)
    } catch (error) {
      console.warn("[e2e] warm OCR measurement skipped:", error instanceof Error ? error.message : error)
    }

    const timing = `cold ${(ocrMs / 1000).toFixed(1)} s${
      warmMs !== null ? ` · warm ${(warmMs / 1000).toFixed(1)} s` : " · warm n/a"
    } (10 fixtures: Cloudinary uploads + browser tesseract worker)`
    console.log(`[e2e] OCR ${timing}`)
    test.info().annotations.push({ type: "ocr-timing", description: timing })

    await context.close()
  })

  test("Act 2 — client review persists, then submits and locks", async ({ browser }) => {
    const context = await publicContext(browser)
    const page = await context.newPage()
    expect(await context.cookies(), "client link must work with no session cookie").toEqual([])
    await page.goto(clientPath)

    // No session cookie here: the published link is the only credential.
    await expect(page.locator("section.brand-section")).toHaveCount(5)
    await expect(page.locator("article.look")).toHaveCount(10)

    const celine = page.locator('section.brand-section[aria-label^="Celine"]')
    const bottega = page.locator('section.brand-section[aria-label^="Bottega Veneta"]')
    const celineCard = celine.locator("article.look").first()
    const bottegaCard = bottega.locator("article.look").first()

    await submitAction(page, celineCard.getByRole("button", { name: /approval|approve/i }))
    await expect(celineCard.getByRole("button", { name: /approval|approve/i })).toHaveAttribute("aria-pressed", "true")
    await submitAction(page, bottegaCard.getByRole("button", { name: /approval|approve/i }))
    await expect(bottegaCard.getByRole("button", { name: /approval|approve/i })).toHaveAttribute("aria-pressed", "true")

    // Priority only applies to approved looks; both are approved now.
    await submitAction(page, celineCard.getByRole("button", { name: /^2 stars/ }))
    await submitAction(page, bottegaCard.getByRole("button", { name: /^3 stars/ }))
    const note = "Love this — keep the shoulders sharp."
    await celineCard.getByLabel(/note for look/).fill(note)
    await submitAction(page, celineCard.getByRole("button", { name: "save", exact: true }))

    // Hard reload: per-action persistence is FR-10's acceptance criterion.
    await page.reload()
    await expect(page.locator('section.brand-section[aria-label^="Celine"] article.look').first().getByRole("button", { name: /approval|approve/i })).toHaveAttribute("aria-pressed", "true")
    await expect(page.locator('section.brand-section[aria-label^="Celine"] article.look').first().getByRole("button", { name: /^2 stars/ })).toHaveAttribute("aria-pressed", "true")
    await expect(page.locator('section.brand-section[aria-label^="Celine"] article.look').first().getByLabel(/note for look/)).toHaveValue(note)
    await expect(page.locator('section.brand-section[aria-label^="Bottega Veneta"] article.look').first().getByRole("button", { name: /^3 stars/ })).toHaveAttribute("aria-pressed", "true")

    // Sticky bar counts: 2 approved, 0 passed, both starred looks are must-haves (2★+).
    const counts = page.locator('[aria-live="polite"]')
    await expect(counts).toContainText("2 approved")
    await expect(counts).toContainText("0 passed")
    await expect(counts).toContainText("2 must-haves")

    await page.getByRole("link", { name: /review & send/i }).click()
    await page.waitForURL(/\/review$/)
    await expect(page.getByRole("heading", { name: "2 looks for Juje" })).toBeVisible()
    await page.getByRole("button", { name: "send to Juje" }).click()
    await page.waitForURL((url) => url.pathname === clientPath)

    // FR-11: the board is now a read-only record.
    await expect(page.getByText("review submitted")).toBeVisible()
    await expect(page.getByText("the board is locked")).toBeVisible()
    await expect(page.getByRole("button", { name: /approval|approve|pass/i })).toHaveCount(0)

    await page.screenshot({ path: artifact("act2-locked.png"), fullPage: false })
    await context.close()
  })

  test("Act 3 — requests, intake, real Shippo rates, gated purchase", async ({ browser }) => {
    const context = await stylistContext(browser)
    const page = await context.newPage()

    // The client's report came back with matching counts (FR-12).
    await page.goto(`/studio/jobs/${jobId}`)
    const report = page.locator('section[aria-label="Client review report"]')
    await expect(report).toBeVisible()
    await expect(report.locator(".stat", { hasText: "approved" }).locator(".n")).toHaveText("2")
    await expect(report.locator(".stat", { hasText: "brands to request" }).locator(".n")).toHaveText("2")

    // FR-15/16 precondition: a fresh DB has only CELINE. The demo seed is an idempotent upsert and
    // supplies both shipping branches (CELINE/PRADA ship themselves; BOTTEGA VENETA/JIL SANDER/
    // LEMAIRE need a label).
    await page.goto("/studio/contacts")
    await page.getByRole("button", { name: "Load 5 demo brands" }).click()
    await page.waitForURL(/seeded=/)
    await expect(page.getByText(/demo brands loaded/i)).toBeVisible()
    await expect(page.locator('section[aria-label="Contacts"] tbody tr')).toHaveCount(5)

    // FR-13: one draft per brand with approved looks; none for the other three houses.
    await page.goto(`/studio/jobs/${jobId}/requests`)
    // The client's submit may already have auto-drafted (before Contacts was seeded). "Draft requests"
    // and "Refresh unsent drafts" run the same idempotent action; pressing it now resolves contacts
    // and adopts their casing/branch for every unsent draft.
    const draftButton = page.getByRole("button", { name: /Draft requests|Refresh unsent drafts/ })
    if (await draftButton.isVisible().catch(() => false)) {
      await draftButton.click()
      await page.waitForURL(/drafted=/)
    }
    await expect(page.getByText("Every brand has a resolved contact.")).toBeVisible()
    await expect(page.locator('section[aria-label$=" request"]')).toHaveCount(2, { timeout: 30_000 })
    for (const absent of ["JIL SANDER", "LEMAIRE", "PRADA"]) {
      await expect(page.locator(`section[aria-label="${absent} request"]`)).toHaveCount(0)
    }

    const celine = page.locator('section[aria-label="CELINE request"]')
    const bottega = page.locator('section[aria-label="BOTTEGA VENETA request"]')
    await expect(celine).toBeVisible()
    await expect(bottega).toBeVisible()
    await expect(celine).toContainText("showroom ships")
    await expect(celine).not.toContainText("INTAKE")
    await expect(bottega).toContainText("needs a label")

    // SHOOT DETAILS + ship-to must be in every drafted body (FR-13).
    const bodies = page.locator("textarea")
    await expect(bodies.first()).toHaveValue(/SHOOT DETAILS/)
    await expect(bodies.first()).toHaveValue(/Ship to:/)

    const intakeLine = bottega.locator("p", { hasText: "INTAKE" }).first()
    const intakeUrl = (await intakeLine.innerText()).replace(/^.*INTAKE\s+/, "").trim()
    const intakePath = new URL(intakeUrl).pathname

    // FR-17/18 in a cookie-free context: fill the intake, get real Shippo rates.
    const guest = await publicContext(browser)
    expect(await guest.cookies(), "intake link must work with no session cookie").toEqual([])
    const intake = await guest.newPage()
    await intake.goto(intakePath)
    await intake.getByLabel("Length (cm)").fill("40")
    await intake.getByLabel("Width (cm)").fill("30")
    await intake.getByLabel("Height (cm)").fill("12")
    // 1.2 is the demo default and is valid with the fixed min=0.05 / step=0.05 grid.
    await intake.getByLabel("Weight (kg)").fill("1.2")
    await intake.getByLabel("Street address").fill("Via della Spiga 15")
    await intake.getByLabel("City").fill("Milano")
    await intake.getByLabel("State / region").fill("Lombardia")
    await intake.getByLabel("Postcode / ZIP").fill("20121")
    await intake.getByLabel("Country").selectOption("IT")
    await intake.getByLabel("Contact name").fill("Bottega Veneta Showroom")
    await intake.getByLabel("Phone").fill("+39 02 555 0144")
    await intake.getByRole("button", { name: "See shipping options" }).click()

    const ratesCard = intake.locator('section[aria-label="Shipping options"]')
    await expect(ratesCard).toBeVisible({ timeout: 60_000 })
    const rateRows = ratesCard.locator(".rate-option")
    await expect(rateRows).toHaveCount(3)
    const rateTexts = (await rateRows.allInnerTexts()).map((text) => text.replace(/\s+/g, " ").trim())
    for (const rowText of rateTexts) {
      expect(rowText, "carrier, service, days and a price").toMatch(/[€$£]\s?\d/)
      expect(rowText).toMatch(/\d+\s+day/i)
    }
    const cheapest = rateTexts[0] ?? ""
    console.log(`[e2e] Shippo rates (cheapest first):\n${rateTexts.map((text) => `  - ${text}`).join("\n")}`)
    test.info().annotations.push({ type: "shippo-rates", description: rateTexts.join(" | ") })
    await intake.screenshot({ path: artifact("act3-rates.png"), fullPage: false })
    await guest.close()

    // Back in the studio: choose a rate, then prove the purchase gate is closed and spent nothing.
    await page.goto(`/studio/jobs/${jobId}/requests`)
    const panel = page.locator('section[aria-label="Label for BOTTEGA VENETA"]')
    await expect(panel).toBeVisible()
    await panel.getByRole("button", { name: "Choose", exact: true }).first().click()
    await page.waitForURL(/note=/)

    const buy = panel.getByRole("button", { name: /Buy label/ })
    await expect(buy).toBeVisible()
    await expect(buy).toBeDisabled()
    await expect(buy).toContainText(/spends money/i)
    await expect(page.getByText(/purchases are disabled/i).first()).toBeVisible()

    // Attempt the purchase anyway (requestSubmit bypasses the disabled button) — the action must
    // refuse with the gate message and write no label.
    const buyForm = panel.locator('form:has(button:text-matches("Buy label"))')
    await buyForm.evaluate((form: HTMLFormElement) => form.requestSubmit())
    await page.waitForURL(/error=/, { timeout: 30_000 })
    await expect(page.getByRole("alert").filter({ hasText: "purchases are disabled" })).toBeVisible()

    const shipment = await shipmentForJob(jobId)
    expect(shipment, "shipments row exists after intake").not.toBeNull()
    expect(shipment?.labelUrl, "no label URL was written").toBeNull()
    expect(shipment?.trackingNumber, "no tracking number was written").toBeNull()
    expect(shipment?.chosenRateId, "the chosen rate persisted").not.toBeNull()

    await page.screenshot({ path: artifact("act3-gated.png"), fullPage: false })
    await context.close()
  })
})

// Keep the first allow-listed email visible in the spec output for debugging auth problems.
test.beforeAll(() => {
  console.log(`[e2e] authenticated as ${firstAllowedEmail()}; dates ${isoDate(0)}/${isoDate(2)}/${isoDate(10)}`)
})
