/**
 * CSV parsing + contact validation for /studio/contacts (PRD FR-15, §8 contacts table).
 *
 * Pure and dependency-free so the same rules run in two places: the preview page (before anything is
 * written) and the server action (authoritative, re-parses the raw CSV). The demo import is small, so
 * a strict whole-file parser is better here than a permissive library:
 *
 *   brand,pr_market,emails,street1,street2,city,state,zip,country,ships_on_own_account
 *
 * One malformed row rejects the whole import — partial contact books are worse than none — and the
 * error names the line and the reason.
 */

export const CONTACT_COLUMNS = [
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
] as const

export type ContactColumn = (typeof CONTACT_COLUMNS)[number]

/** Matches the studio server-action body limit with headroom; the preview cookie is smaller. */
export const MAX_CSV_LENGTH = 512 * 1024
export const MAX_CONTACT_ROWS = 200

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SHIPS_TRUE = new Set(["true", "yes", "1", "y"])
const SHIPS_FALSE = new Set(["false", "no", "0", "n"])

export interface ContactInput {
  /** Canonical uppercase — the table shows brands the way the runway does. */
  brand: string
  /** Canonical uppercase; "" when the CSV leaves the market blank. */
  prMarket: string
  emails: string[]
  showroomAddress: Record<string, string>
  shipsOnOwnAccount: boolean
}

export interface ParsedContactRow extends ContactInput {
  /** 1-based line in the uploaded CSV; the header is line 1. */
  line: number
  /** Non-fatal issues surfaced in the preview (no email = sends blocked). */
  warnings: string[]
  /** True when the row has no email — the request for this brand will be blocked, never sent. */
  blocked: boolean
}

export interface CsvRowError {
  line: number
  message: string
}

export interface ParsedContactsCsv {
  rows: ParsedContactRow[]
  errors: CsvRowError[]
}

interface CsvRecord {
  fields: string[]
  line: number
}

/** RFC-4180-ish scan: quoted fields, escaped quotes, CRLF, embedded newlines. */
function scanRecords(text: string): CsvRecord[] {
  const records: CsvRecord[] = []
  let fields: string[] = []
  let field = ""
  let inQuotes = false
  let line = 1
  let recordLine = 1

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        if (ch === "\n") line += 1
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      fields.push(field)
      field = ""
    } else if (ch === "\n") {
      fields.push(field)
      records.push({ fields, line: recordLine })
      fields = []
      field = ""
      line += 1
      recordLine = line
    } else if (ch !== "\r") {
      field += ch
    }
  }
  if (field.length > 0 || fields.length > 0) {
    fields.push(field)
    records.push({ fields, line: recordLine })
  }
  return records
}

function normaliseHeaderCell(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_")
}

/** Validate one record of contact fields. Used by the CSV parser and by the edit form. */
export function parseContactFields(fields: Partial<Record<ContactColumn, string>>): {
  contact?: ContactInput
  warnings?: string[]
  error?: string
} {
  const brand = (fields.brand ?? "").trim().replace(/\s+/g, " ").toUpperCase()
  if (!brand) return { error: "brand is required." }
  if (brand.length > 80) return { error: "brand is longer than 80 characters." }

  const prMarket = (fields.pr_market ?? "").trim().replace(/\s+/g, " ").toUpperCase()
  if (prMarket.length > 60) return { error: "pr_market is longer than 60 characters." }

  const rawEmails = (fields.emails ?? "").trim()
  const emails = rawEmails
    ? rawEmails
        .split(";")
        .map((email) => email.trim())
        .filter(Boolean)
    : []
  const invalid = emails.filter((email) => !EMAIL_RE.test(email))
  if (invalid.length > 0) {
    return {
      error: `emails: ${invalid.map((email) => `"${email}"`).join(", ")} ${
        invalid.length === 1 ? "is" : "are"
      } not a valid email ${invalid.length === 1 ? "address" : "addresses"}.`,
    }
  }
  const dedupedEmails = [...new Set(emails.map((email) => email.toLowerCase()))]

  const showroomAddress: Record<string, string> = {}
  for (const key of ["street1", "street2", "city", "state", "zip"] as const) {
    const value = (fields[key] ?? "").trim()
    if (value) showroomAddress[key] = value
  }
  const rawCountry = (fields.country ?? "").trim()
  if (!rawCountry) return { error: "country is required (2-letter ISO code)." }
  if (!/^[a-z]{2}$/i.test(rawCountry)) {
    return { error: `country "${rawCountry}" is not a 2-letter ISO code.` }
  }
  showroomAddress.country = rawCountry.toUpperCase()

  const rawShips = (fields.ships_on_own_account ?? "").trim().toLowerCase()
  let shipsOnOwnAccount: boolean
  if (SHIPS_TRUE.has(rawShips)) shipsOnOwnAccount = true
  else if (SHIPS_FALSE.has(rawShips)) shipsOnOwnAccount = false
  else {
    return {
      error: `ships_on_own_account must be true or false (got "${fields.ships_on_own_account ?? ""}").`,
    }
  }

  const warnings: string[] = []
  if (dedupedEmails.length === 0) warnings.push("no email — sends for this brand will be blocked")
  if (!showroomAddress.street1 || !showroomAddress.city || !showroomAddress.zip) {
    warnings.push("showroom address is incomplete")
  }

  return {
    contact: {
      brand,
      prMarket,
      emails: dedupedEmails,
      showroomAddress,
      shipsOnOwnAccount,
    },
    warnings,
  }
}

export function contactKey(brand: string, prMarket: string | null | undefined): string {
  return `${brand.trim().toUpperCase()}|${(prMarket ?? "").trim().toUpperCase()}`
}

export function parseContactsCsv(text: string): ParsedContactsCsv {
  const trimmed = text.replace(/^\uFEFF/, "").trim()
  if (!trimmed) return { rows: [], errors: [{ line: 1, message: "The CSV is empty." }] }
  if (trimmed.length > MAX_CSV_LENGTH) {
    return {
      rows: [],
      errors: [{ line: 1, message: "That CSV is larger than 512 KB — split it into batches." }],
    }
  }

  const records = scanRecords(trimmed)
  if (records.length === 0) return { rows: [], errors: [{ line: 1, message: "The CSV is empty." }] }

  const header = records[0].fields.map(normaliseHeaderCell)
  const missing = CONTACT_COLUMNS.filter((column) => !header.includes(column))
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          line: records[0].line,
          message: `Header is missing the column${missing.length === 1 ? "" : "s"} ${missing
            .map((column) => `"${column}"`)
            .join(", ")}.`,
        },
      ],
    }
  }

  const rows: ParsedContactRow[] = []
  const errors: CsvRowError[] = []
  const seen = new Map<string, number>()

  for (const record of records.slice(1)) {
    const { fields, line } = record
    if (fields.every((value) => value.trim() === "")) continue
    if (rows.length >= MAX_CONTACT_ROWS) {
      errors.push({
        line,
        message: `This file has more than ${MAX_CONTACT_ROWS} contact rows — split it into batches.`,
      })
      break
    }
    if (fields.length !== header.length) {
      errors.push({
        line,
        message: `expected ${header.length} columns, found ${fields.length}.`,
      })
      continue
    }

    const byColumn: Partial<Record<ContactColumn, string>> = {}
    header.forEach((column, index) => {
      if (isContactColumn(column)) byColumn[column] = fields[index] ?? ""
    })

    const parsed = parseContactFields(byColumn)
    if (!parsed.contact) {
      errors.push({ line, message: parsed.error ?? "row could not be read." })
      continue
    }

    const key = contactKey(parsed.contact.brand, parsed.contact.prMarket)
    const duplicateOf = seen.get(key)
    if (duplicateOf !== undefined) {
      errors.push({
        line,
        message: `duplicates row ${duplicateOf} (${parsed.contact.brand} / ${
          parsed.contact.prMarket || "no market"
        }).`,
      })
      continue
    }
    seen.set(key, line)

    rows.push({
      ...parsed.contact,
      line,
      warnings: parsed.warnings ?? [],
      blocked: parsed.contact.emails.length === 0,
    })
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ line: 2, message: "the CSV has a header but no contact rows." })
  }

  return { rows, errors }
}

function isContactColumn(value: string): value is ContactColumn {
  return (CONTACT_COLUMNS as readonly string[]).includes(value)
}

export interface CsvPreviewSummary {
  rows: number
  blocked: number
  incompleteAddress: number
}

export function summarizeContactsCsv(rows: ParsedContactRow[]): CsvPreviewSummary {
  return {
    rows: rows.length,
    blocked: rows.filter((row) => row.blocked).length,
    incompleteAddress: rows.filter((row) => row.warnings.includes("showroom address is incomplete"))
      .length,
  }
}

/** One line for the contacts table, in the same key order the request email template uses. */
export function oneLineAddress(address: Record<string, string> | null | undefined): string {
  if (!address) return ""
  return ["name", "street1", "street2", "city", "state", "zip", "country"]
    .map((key) => address[key])
    .filter(Boolean)
    .join(", ")
}

export function emailsLine(emails: string[] | null | undefined): string {
  return (emails ?? []).join("; ")
}

/** Shown in the import panel's help block. */
export const SAMPLE_CSV = [
  "brand,pr_market,emails,street1,street2,city,state,zip,country,ships_on_own_account",
  'CELINE,PARIS,press@celine.example,12 Rue de la Paix,,Paris,Île-de-France,75002,FR,true',
  'BOTTEGA VENETA,MILAN,press@bottegaveneta.example,Via della Spiga 15,,Milano,Lombardia,20121,IT,false',
].join("\n")
