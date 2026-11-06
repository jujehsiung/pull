/**
 * CSV import panel (FR-15, two-step):
 *   step 1: paste or choose a CSV -> `previewContactsCsvForm` validates the whole file and parks it
 *           in a short-lived cookie, redirecting back with ?preview=1;
 *   step 2: the server-rendered preview below shows every row (and who would be blocked) and the
 *           single confirm form writes it: `importContactsCsvForm`.
 *
 * No client JavaScript is involved, so the whole flow works without JS and with curl.
 */
import Link from "next/link"
import { importContactsCsvForm, previewContactsCsvForm } from "@/server/actions/contacts"
import {
  CONTACT_COLUMNS,
  emailsLine,
  oneLineAddress,
  SAMPLE_CSV,
  summarizeContactsCsv,
  type ParsedContactRow,
} from "./csv"
import styles from "./contacts.module.css"

export function ContactsCsvPanel({ preview }: { preview: ParsedContactRow[] | null }) {
  if (preview) {
    const summary = summarizeContactsCsv(preview)
    const warnings = preview.filter((row) => row.warnings.length > 0)

    return (
      <section className={styles.card} aria-label="CSV import preview">
        <div className={styles.cardHead}>
          <p className="eyebrow" style={{ margin: 0 }}>
            CSV IMPORT · PREVIEW
          </p>
          <span className={styles.count}>{summary.rows} ROWS</span>
        </div>

        <p className={styles.previewSummary}>
          <b>{summary.rows}</b> row{summary.rows === 1 ? "" : "s"}
          {summary.blocked > 0 ? (
            <>
              , <b>{summary.blocked}</b> without an email — those will be blocked
            </>
          ) : null}
          {summary.incompleteAddress > 0 ? (
            <>
              , <b>{summary.incompleteAddress}</b> with an incomplete showroom address
            </>
          ) : null}
          .
        </p>
        <p className={styles.previewMeta}>Nothing has been written yet. Confirm to import.</p>

        {warnings.length > 0 ? (
          <ul className={styles.warnList}>
            {warnings.map((row) => (
              <li key={`${row.line}-${row.brand}`}>
                Row {row.line} · {row.brand}
                {row.prMarket ? ` / ${row.prMarket}` : ""}: {row.warnings.join("; ")}
              </li>
            ))}
          </ul>
        ) : null}

        <div className={styles.previewTableWrap}>
          <table className={styles.previewTable}>
            <thead>
              <tr>
                <th scope="col" className={styles.th}>
                  Line
                </th>
                <th scope="col" className={styles.th}>
                  Brand
                </th>
                <th scope="col" className={styles.th}>
                  Market
                </th>
                <th scope="col" className={styles.th}>
                  Emails
                </th>
                <th scope="col" className={styles.th}>
                  Showroom
                </th>
                <th scope="col" className={styles.th}>
                  Shipping
                </th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={`${row.line}-${row.brand}-${row.prMarket}`}>
                  <td className={styles.td}>{row.line}</td>
                  <td className={styles.td}>
                    <span className={styles.brand}>{row.brand}</span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.market}>{row.prMarket || "any"}</span>
                  </td>
                  <td className={styles.td}>
                    {row.emails.length > 0 ? (
                      <span className={styles.emails}>{emailsLine(row.emails)}</span>
                    ) : (
                      <span className={`${styles.tag} ${styles.tagWarn}`}>blocks sends</span>
                    )}
                  </td>
                  <td className={styles.td}>
                    <span className={styles.address}>{oneLineAddress(row.showroomAddress)}</span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.shipsWord}>
                      {row.shipsOnOwnAccount ? "showroom ships" : "needs a label"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form action={importContactsCsvForm} className={styles.confirmRow}>
          <button type="submit" className="btn btn-primary">
            Import {summary.rows} contact{summary.rows === 1 ? "" : "s"}
          </button>
          <Link className={styles.linkBtn} href="/studio/contacts">
            use a different file
          </Link>
        </form>
        <p className={styles.fileNote} style={{ marginTop: 10 }}>
          Re-importing the same file updates the matching brand + market rows; it never duplicates
          them. Rows without an email are still saved so the block is visible.
        </p>
      </section>
    )
  }

  return (
    <section className={styles.card} aria-label="Import contacts from CSV">
      <div className={styles.cardHead}>
        <p className="eyebrow" style={{ margin: 0 }}>
          CSV IMPORT
        </p>
        <span className={styles.count}>CSV</span>
      </div>

      <form action={previewContactsCsvForm}>
        <label htmlFor="csv-input" className="eyebrow">
          Paste a CSV
        </label>
        <textarea
          id="csv-input"
          name="csv"
          className={styles.textarea}
          placeholder={SAMPLE_CSV}
          spellCheck={false}
          style={{ marginTop: 8 }}
        />
        <div className={styles.fileRow}>
          <label htmlFor="csv-file" className={styles.fileNote}>
            or choose a .csv file
          </label>
          <input
            id="csv-file"
            type="file"
            name="file"
            accept=".csv,text/csv"
            className={styles.fileInput}
          />
        </div>
        <div className={styles.confirmRow}>
          <button type="submit" className="btn btn-primary">
            Preview import
          </button>
          <span className={styles.fileNote}>
            Nothing is written until you confirm the preview.
          </span>
        </div>
      </form>

      <details className={styles.help}>
        <summary>Columns and format</summary>
        <p className={styles.fileNote} style={{ margin: "0 0 8px" }}>
          Required header (extra columns are ignored): {CONTACT_COLUMNS.join(", ")}. Emails are
          separated by semicolons inside one field. Country is a 2-letter ISO code;{" "}
          <code>ships_on_own_account</code> is true or false.
        </p>
        <pre className={styles.sample}>{SAMPLE_CSV}</pre>
      </details>
    </section>
  )
}
