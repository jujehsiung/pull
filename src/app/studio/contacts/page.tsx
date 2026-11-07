/**
 * /studio/contacts — the stylist's contact book (PRD FR-15/16, §12).
 *
 * One page, three jobs:
 *   - the table: brand + market -> emails, showroom address, ships_on_own_account (in words);
 *   - the two-step CSV import: preview everything first, then one confirm that upserts;
 *   - the five-brand demo seed, clearly marked as sample data.
 *
 * Everything is server-rendered forms, so the whole page works without JavaScript and the actions
 * can be driven with curl. The two-step preview state lives in a 10-minute httpOnly cookie set by
 * the preview action (see preview-cookie.ts) — no CSV in a URL, no partially-written imports.
 */
import { cookies } from "next/headers"
import { requireStylist } from "@/lib/auth"
import { getContact, listContacts } from "@/server/queries/contacts"
import { seedDemoContactsForm } from "@/server/actions/contacts"
import { ContactsTable } from "@/components/studio/contacts/ContactsTable"
import { ContactEditForm } from "@/components/studio/contacts/ContactEditForm"
import { ContactsCsvPanel } from "@/components/studio/contacts/ContactsCsvPanel"
import { parseContactsCsv, type ParsedContactRow } from "@/components/studio/contacts/csv"
import { decodeContactsPreview, PREVIEW_COOKIE } from "@/components/studio/contacts/preview-cookie"
import styles from "@/components/studio/contacts/contacts.module.css"

export const metadata = { title: "PULL — contacts" }

type ContactQuery = Record<string, string | undefined>

export default async function ContactsPage({ searchParams }: { searchParams: Promise<ContactQuery> }) {
  const stylist = await requireStylist()
  const query = await searchParams
  const rows = await listContacts(stylist.id)
  const withEmails = rows.filter((row) => (row.emails ?? []).length > 0).length

  const editing = query.edit ? await getContact(stylist.id, query.edit) : null

  // The preview is only read when the preview action sent us here; the cookie is httpOnly and
  // scoped to /studio/contacts, and expires after 10 minutes.
  let preview: ParsedContactRow[] | null = null
  let previewError: string | null = null
  if (query.preview === "1") {
    const jar = await cookies()
    const payload = decodeContactsPreview(jar.get(PREVIEW_COOKIE)?.value)
    if (!payload || payload.userId !== stylist.id) {
      previewError = "That import preview expired — paste the CSV again."
    } else {
      const parsed = parseContactsCsv(payload.csv)
      if (parsed.errors.length > 0) {
        previewError = parsed.errors
          .slice(0, 3)
          .map((error) => `Row ${error.line}: ${error.message}`)
          .join(" · ")
      } else {
        preview = parsed.rows
      }
    }
  }

  const notice = (() => {
    if (query.importError) {
      const more = query.importErrorMore ? ` (+${query.importErrorMore} more row errors)` : ""
      return {
        tone: "error" as const,
        text: `Import rejected — nothing was written. ${query.importError}${more}`,
      }
    }
    if (query.imported) {
      const blocked = Number(query.blocked ?? "0")
      return {
        tone: "ok" as const,
        text: `${query.imported} contacts imported — ${query.created ?? "0"} new, ${
          query.updated ?? "0"
        } updated.${blocked > 0 ? ` ${blocked} have no email, so their brands stay blocked.` : ""}`,
      }
    }
    if (query.seeded) {
      return {
        tone: "ok" as const,
        text: `${query.seeded} demo brands loaded — sample showrooms only, marked DEMO SEED in the table.`,
      }
    }
    if (query.saved) return { tone: "ok" as const, text: "Contact saved." }
    if (query.deleted) return { tone: "ok" as const, text: "Contact deleted." }
    return null
  })()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">Contacts</p>
          <h1
            className="display"
            style={{ margin: "12px 0 0", fontSize: "clamp(30px, 4vw, 44px)" }}
          >
            {rows.length ? `${rows.length} contact${rows.length === 1 ? "" : "s"}` : "No contacts yet"}
          </h1>
          <p className={`lead ${styles.headerLead}`} style={{ marginTop: 12 }}>
            Brand + market → the emails and showroom that ship the samples. A request without a
            resolved contact is blocked, never guessed.
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.count}>
            {withEmails} OF {rows.length} WITH EMAIL
          </span>
          <form action={seedDemoContactsForm}>
            <button
              type="submit"
              className="btn btn-ghost"
              title="Insert five sample brands with plausible showrooms — demo data, not real PR contacts"
            >
              Load 5 demo brands
            </button>
          </form>
        </div>
      </header>

      {notice ? (
        <p
          className={`${styles.banner} ${notice.tone === "error" ? styles.bannerError : styles.bannerOk}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      ) : null}

      {query.editError ? (
        <p className={`${styles.banner} ${styles.bannerError}`} role="alert">
          {query.editError}
        </p>
      ) : null}

      {query.edit && !editing ? (
        <p className={`${styles.banner} ${styles.bannerError}`} role="alert">
          That contact is no longer in your book.
        </p>
      ) : null}

      {editing ? <ContactEditForm contact={editing} /> : null}

      <ContactsTable contacts={rows} />

      <div className={styles.csvPanel}>
        {previewError ? (
          <p className={`${styles.banner} ${styles.bannerError}`} role="alert">
            {previewError}
          </p>
        ) : null}
        <ContactsCsvPanel preview={preview} />
      </div>
    </div>
  )
}
