/**
 * Contacts book mutations (PRD FR-15 / FR-16, §8 contacts).
 *
 * The import is two-phase and deliberately server-rendered:
 *   1. `previewContactsCsvForm` validates the whole file and parks it in a short-lived httpOnly
 *      cookie (no partial writes, no CSV in a URL), then redirects to the preview page.
 *   2. `importContactsCsvForm` re-parses that CSV from the cookie and upserts on
 *      (user_id, brand, pr_market) — re-importing the same file is idempotent.
 *
 * Every action calls requireStylist() and scopes by stylist.id; a contact id from the browser is
 * only ever a lookup key inside that stylist's book. Contact edits are not job-scoped, so they write
 * no event rows (per the task brief).
 */
"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/db/client"
import { contacts } from "@/db/schema"
import { requireStylist } from "@/lib/auth"
import {
  contactKey,
  parseContactFields,
  parseContactsCsv,
  type ContactColumn,
  type CsvRowError,
  MAX_CSV_LENGTH,
} from "@/components/studio/contacts/csv"
import {
  decodeContactsPreview,
  encodeContactsPreview,
  PREVIEW_COOKIE,
  PREVIEW_TTL_MS,
} from "@/components/studio/contacts/preview-cookie"

const CONTACTS_PATH = "/studio/contacts"
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: CONTACTS_PATH,
}

/** Redirect back to the page with a small, URL-safe flash. Never returns. */
function back(params: Record<string, string | number | undefined>): never {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue
    query.set(key, String(value))
  }
  revalidatePath(CONTACTS_PATH)
  redirect(`${CONTACTS_PATH}${query.toString() ? `?${query.toString()}` : ""}`)
}

/** Row-numbered errors, first three inline and a count for the rest (a query string has limits). */
function importErrorFlash(errors: CsvRowError[]): Record<string, string> {
  const shown = errors
    .slice(0, 3)
    .map((error) => `Row ${error.line}: ${error.message}`)
    .join(" · ")
  return {
    importError: shown || "The CSV could not be read.",
    importErrorMore: errors.length > 3 ? String(errors.length - 3) : "",
  }
}

async function readCsvFromForm(form: FormData): Promise<{ csv: string } | { error: string }> {
  const fileValue = form.get("file")
  if (typeof File !== "undefined" && fileValue instanceof File && fileValue.size > 0) {
    if (fileValue.size > MAX_CSV_LENGTH) {
      return { error: "That file is larger than 512 KB — split it into batches." }
    }
    return { csv: await fileValue.text() }
  }
  const csv = String(form.get("csv") ?? "")
  if (!csv.trim()) return { error: "Paste a CSV or choose a .csv file first." }
  if (csv.length > MAX_CSV_LENGTH) {
    return { error: "That CSV is larger than 512 KB — split it into batches." }
  }
  return { csv }
}

// ── CSV: step 1, validate + preview ──────────────────────────────────────────────────────────────

export async function previewContactsCsvForm(form: FormData): Promise<void> {
  const stylist = await requireStylist()
  const source = await readCsvFromForm(form)
  if ("error" in source) back({ importError: source.error })

  const parsed = parseContactsCsv(source.csv)
  if (parsed.errors.length > 0) back(importErrorFlash(parsed.errors))

  const encoded = encodeContactsPreview({
    userId: stylist.id,
    csv: source.csv,
    exp: Date.now() + PREVIEW_TTL_MS,
  })
  if (!encoded) {
    back({
      importError:
        "That CSV is too large to preview safely — split it into a few smaller files (200 rows each).",
    })
  }

  const jar = await cookies()
  jar.set(PREVIEW_COOKIE, encoded, { ...COOKIE_OPTIONS, maxAge: PREVIEW_TTL_MS / 1000 })
  back({ preview: 1 })
}

// ── CSV: step 2, confirm (the only write) ────────────────────────────────────────────────────────

export async function importContactsCsvForm(): Promise<void> {
  const stylist = await requireStylist()
  const jar = await cookies()
  const payload = decodeContactsPreview(jar.get(PREVIEW_COOKIE)?.value)
  jar.set(PREVIEW_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 })

  if (!payload || payload.userId !== stylist.id) {
    back({ importError: "That import preview expired — paste the CSV again." })
  }

  const parsed = parseContactsCsv(payload.csv)
  if (parsed.errors.length > 0) back(importErrorFlash(parsed.errors))

  // Counts are collected inside the write block; the redirect happens after it, outside the try —
  // redirect() throws NEXT_REDIRECT, which must never be mistaken for a failed write.
  let created = 0
  let updated = 0
  let blocked = 0
  try {
    const existing = await db()
      .select({ brand: contacts.brand, prMarket: contacts.prMarket })
      .from(contacts)
      .where(eq(contacts.userId, stylist.id))
    const known = new Set(existing.map((row) => contactKey(row.brand, row.prMarket)))

    for (const row of parsed.rows) {
      const values = {
        userId: stylist.id,
        brand: row.brand,
        prMarket: row.prMarket,
        emails: row.emails,
        showroomAddress: row.showroomAddress,
        shipsOnOwnAccount: row.shipsOnOwnAccount,
      }
      await db()
        .insert(contacts)
        .values(values)
        .onConflictDoUpdate({
          target: [contacts.userId, contacts.brand, contacts.prMarket],
          set: {
            emails: values.emails,
            showroomAddress: values.showroomAddress,
            shipsOnOwnAccount: values.shipsOnOwnAccount,
          },
        })
      const key = contactKey(row.brand, row.prMarket)
      if (known.has(key)) updated += 1
      else {
        created += 1
        known.add(key)
      }
      if (row.blocked) blocked += 1
    }
  } catch (error) {
    console.error("[contacts] import failed", error)
    back({ importError: "The import could not be written. Nothing was saved — try again." })
  }

  back({ imported: parsed.rows.length, created, updated, blocked })
}

// ── single-row edit / delete ────────────────────────────────────────────────────────────────────

function fieldsFromForm(form: FormData): Partial<Record<ContactColumn, string>> {
  const out: Partial<Record<ContactColumn, string>> = {}
  for (const key of [
    "brand",
    "pr_market",
    "emails",
    "street1",
    "street2",
    "city",
    "state",
    "zip",
    "country",
    "ships_on_own_account",
  ] as const) {
    const value = form.get(key)
    if (typeof value === "string") out[key] = value
  }
  return out
}

export async function updateContactForm(form: FormData): Promise<void> {
  const stylist = await requireStylist()
  const id = String(form.get("id") ?? "")
  const parsed = parseContactFields(fieldsFromForm(form))
  if (!parsed.contact) back({ edit: id, editError: parsed.error ?? "That contact could not be saved." })

  const [existing] = await db()
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, stylist.id)))
    .limit(1)
  if (!existing) back({ importError: "Contact not found." })

  try {
    await db()
      .update(contacts)
      .set({
        brand: parsed.contact.brand,
        prMarket: parsed.contact.prMarket,
        emails: parsed.contact.emails,
        showroomAddress: parsed.contact.showroomAddress,
        shipsOnOwnAccount: parsed.contact.shipsOnOwnAccount,
      })
      .where(and(eq(contacts.id, id), eq(contacts.userId, stylist.id)))
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === "23505") {
      back({
        edit: id,
        editError: "Another contact already uses that brand and market. Edit that one instead.",
      })
    }
    console.error("[contacts] update failed", error)
    back({ edit: id, editError: "The contact could not be saved. Nothing was changed." })
  }

  back({ saved: 1 })
}

export async function deleteContactForm(form: FormData): Promise<void> {
  const stylist = await requireStylist()
  const id = String(form.get("id") ?? "")
  try {
    await db()
      .delete(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.userId, stylist.id)))
  } catch (error) {
    console.error("[contacts] delete failed", error)
    back({ importError: "The contact could not be deleted." })
  }
  back({ deleted: 1 })
}

// ── demo seed (FR-16 needs both shipping branches present) ─────────────────────────────────────

const DEMO_NOTE = "demo seed — sample showroom, not a real PR contact"

const DEMO_CONTACTS = [
  {
    brand: "CELINE",
    prMarket: "PARIS",
    emails: ["press@celine.example"],
    shipsOnOwnAccount: true,
    showroomAddress: {
      street1: "12 Rue de la Paix",
      city: "Paris",
      state: "Île-de-France",
      zip: "75002",
      country: "FR",
    },
  },
  {
    brand: "BOTTEGA VENETA",
    prMarket: "MILAN",
    emails: ["press@bottegaveneta.example"],
    shipsOnOwnAccount: false,
    showroomAddress: {
      street1: "Via della Spiga 15",
      city: "Milano",
      state: "Lombardia",
      zip: "20121",
      country: "IT",
    },
  },
  {
    brand: "PRADA",
    prMarket: "MILAN",
    emails: ["press@prada.example"],
    shipsOnOwnAccount: true,
    showroomAddress: {
      street1: "Via Fogazzaro 28",
      city: "Milano",
      state: "Lombardia",
      zip: "20135",
      country: "IT",
    },
  },
  {
    brand: "LEMAIRE",
    prMarket: "PARIS",
    emails: ["press@lemaire.example"],
    shipsOnOwnAccount: false,
    showroomAddress: {
      street1: "28 Rue de Poitou",
      city: "Paris",
      state: "Île-de-France",
      zip: "75003",
      country: "FR",
    },
  },
  {
    brand: "JIL SANDER",
    prMarket: "MILAN",
    emails: ["press@jilsander.example"],
    shipsOnOwnAccount: false,
    showroomAddress: {
      street1: "Via San Gregorio 42",
      city: "Milano",
      state: "Lombardia",
      zip: "20124",
      country: "IT",
    },
  },
] as const

/** Idempotent: upserts the five fixture brands and marks them as demo data in `notes`. */
export async function seedDemoContactsForm(): Promise<void> {
  const stylist = await requireStylist()
  try {
    for (const demo of DEMO_CONTACTS) {
      const values = {
        userId: stylist.id,
        brand: demo.brand,
        prMarket: demo.prMarket,
        emails: [...demo.emails],
        showroomAddress: { ...demo.showroomAddress },
        shipsOnOwnAccount: demo.shipsOnOwnAccount,
        notes: DEMO_NOTE,
      }
      await db()
        .insert(contacts)
        .values(values)
        .onConflictDoUpdate({
          target: [contacts.userId, contacts.brand, contacts.prMarket],
          set: {
            emails: values.emails,
            showroomAddress: values.showroomAddress,
            shipsOnOwnAccount: values.shipsOnOwnAccount,
            notes: DEMO_NOTE,
          },
        })
    }
  } catch (error) {
    console.error("[contacts] demo seed failed", error)
    back({ importError: "The demo contacts could not be loaded." })
  }

  // Outside the try: redirect() throws NEXT_REDIRECT and must not be caught as a write failure.
  back({ seeded: DEMO_CONTACTS.length })
}
