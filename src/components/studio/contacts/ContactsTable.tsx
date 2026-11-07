/**
 * The contacts book table (FR-15): brand + market, emails, a one-line showroom address,
 * ships_on_own_account written out in words (never colour alone), and per-row edit/delete.
 *
 * Rows are marked DEMO SEED when they came from the five-brand helper, so sample addresses are never
 * mistaken for real PR contacts.
 */
import Link from "next/link"
import type { ContactRow } from "@/server/queries/contacts"
import { deleteContactForm } from "@/server/actions/contacts"
import { emailsLine, oneLineAddress } from "./csv"
import styles from "./contacts.module.css"

function isDemoSeed(contact: ContactRow): boolean {
  return (contact.notes ?? "").toLowerCase().startsWith("demo seed")
}

function shipsWords(shipsOnOwnAccount: boolean): { word: string; tag: string } {
  return shipsOnOwnAccount
    ? { word: "showroom ships on its own account", tag: "Showroom ships" }
    : { word: "Pull sends a prepaid label", tag: "Needs label" }
}

export function ContactsTable({ contacts }: { contacts: ContactRow[] }) {
  return (
    <section className={styles.card} aria-label="Contacts">
      <div className={styles.cardHead}>
        <p className="eyebrow" style={{ margin: 0 }}>
          CONTACT BOOK
        </p>
        <span className={styles.count}>
          {contacts.length} {contacts.length === 1 ? "Contact" : "Contacts"}
        </span>
      </div>

      {contacts.length === 0 ? (
        <div className={styles.empty}>
          <p className="lead" style={{ margin: 0 }}>
            A contact is the brand&apos;s PR team: brand + market → the emails, the showroom address,
            and whether they ship samples themselves.
          </p>
          <p className="small" style={{ marginTop: 10 }}>
            Without one, Pull blocks the request instead of guessing an address. Import a CSV below,
            or load the five demo brands to see both shipping branches.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" className={styles.th}>
                    Brand
                  </th>
                  <th scope="col" className={`${styles.th} ${styles.colMarket}`}>
                    Market
                  </th>
                  <th scope="col" className={`${styles.th} ${styles.colEmails}`}>
                    Emails
                  </th>
                  <th scope="col" className={styles.th}>
                    Showroom
                  </th>
                  <th scope="col" className={styles.th}>
                    Shipping
                  </th>
                  <th scope="col" className={`${styles.th} ${styles.colActions}`}>
                    <span className={styles.srOnly}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => {
                  const ships = shipsWords(contact.shipsOnOwnAccount)
                  const emails = contact.emails ?? []
                  const address = oneLineAddress(contact.showroomAddress)
                  return (
                    <tr key={contact.id}>
                      <td className={styles.td}>
                        <div className={styles.brandCell}>
                          <span className={styles.brand}>{contact.brand}</span>
                          {isDemoSeed(contact) ? (
                            <span className={styles.chips}>
                              <span className={`${styles.tag} ${styles.tagDemo}`}>demo seed</span>
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className={styles.td}>
                        <span className={styles.market}>{contact.prMarket || "any market"}</span>
                      </td>
                      <td className={styles.td}>
                        {emails.length > 0 ? (
                          <span className={styles.emails}>{emailsLine(emails)}</span>
                        ) : (
                          <span className={`${styles.tag} ${styles.tagWarn}`}>
                            no emails — sends blocked
                          </span>
                        )}
                      </td>
                      <td className={styles.td}>
                        {address ? (
                          <span className={styles.address}>{address}</span>
                        ) : (
                          <span className={`${styles.tag} ${styles.tagWarn}`}>address missing</span>
                        )}
                      </td>
                      <td className={styles.td}>
                        <div className={styles.ships}>
                          <span className={styles.shipsWord}>{ships.word}</span>
                          <span className={styles.tag}>{ships.tag}</span>
                        </div>
                      </td>
                      <td className={`${styles.td} ${styles.colActions}`}>
                        <div className={styles.actions}>
                          <Link
                            className={styles.linkBtn}
                            href={`/studio/contacts?edit=${contact.id}`}
                            aria-label={`Edit ${contact.brand} ${contact.prMarket || "any market"}`}
                          >
                            edit
                          </Link>
                          <form action={deleteContactForm}>
                            <input type="hidden" name="id" value={contact.id} />
                            <button
                              type="submit"
                              className={styles.dangerBtn}
                              aria-label={`Delete ${contact.brand} ${contact.prMarket || "any market"}`}
                            >
                              delete
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className={styles.tableFootnote}>
            Rows marked demo seed are sample showrooms loaded by the demo helper — not real PR
            contacts. A contact with no emails stays in the book but blocks every send for that
            brand.
          </p>
        </>
      )}
    </section>
  )
}
