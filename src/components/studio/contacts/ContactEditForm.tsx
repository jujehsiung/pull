/**
 * Inline edit for one contact (FR-15). A server-rendered form — no client JS — so the edit is one
 * POST and can be exercised with curl. Ownership is re-checked in the action by stylist id.
 */
import Link from "next/link"
import type { ContactRow } from "@/server/queries/contacts"
import { updateContactForm } from "@/server/actions/contacts"
import { emailsLine } from "./csv"
import styles from "./contacts.module.css"

export function ContactEditForm({ contact }: { contact: ContactRow }) {
  const address = contact.showroomAddress ?? {}
  const isDemoSeed = (contact.notes ?? "").toLowerCase().startsWith("demo seed")

  return (
    <section className={styles.card} aria-label={`Edit contact ${contact.brand}`}>
      <div className={styles.cardHead}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>
            EDIT CONTACT
          </p>
          <h2 className="h3" style={{ margin: "8px 0 0" }}>
            {contact.brand} · {contact.prMarket || "any market"}
          </h2>
        </div>
        <Link className={styles.linkBtn} href="/studio/contacts">
          close
        </Link>
      </div>

      <form action={updateContactForm}>
        <input type="hidden" name="id" value={contact.id} />
        <div className={styles.formGrid}>
          <div className="field">
            <label htmlFor="contact-brand">Brand</label>
            <input id="contact-brand" name="brand" defaultValue={contact.brand} required />
          </div>
          <div className="field">
            <label htmlFor="contact-market">PR market</label>
            <input
              id="contact-market"
              name="pr_market"
              defaultValue={contact.prMarket ?? ""}
              placeholder="Paris"
            />
          </div>
          <div className={`field ${styles.full}`}>
            <label htmlFor="contact-emails">Emails (separated by semicolons)</label>
            <input
              id="contact-emails"
              name="emails"
              defaultValue={emailsLine(contact.emails ?? [])}
              placeholder="press@brand.example; samples@brand.example"
            />
          </div>
          <div className="field">
            <label htmlFor="contact-street1">Street 1</label>
            <input id="contact-street1" name="street1" defaultValue={address.street1 ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="contact-street2">Street 2</label>
            <input id="contact-street2" name="street2" defaultValue={address.street2 ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="contact-city">City</label>
            <input id="contact-city" name="city" defaultValue={address.city ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="contact-state">State / region</label>
            <input id="contact-state" name="state" defaultValue={address.state ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="contact-zip">ZIP / postcode</label>
            <input id="contact-zip" name="zip" defaultValue={address.zip ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="contact-country">Country (ISO 2-letter)</label>
            <input
              id="contact-country"
              name="country"
              defaultValue={address.country ?? ""}
              placeholder="FR"
              maxLength={2}
            />
          </div>
          <div className="field">
            <label htmlFor="contact-ships">Ships samples on its own account</label>
            <select
              id="contact-ships"
              name="ships_on_own_account"
              defaultValue={contact.shipsOnOwnAccount ? "true" : "false"}
            >
              <option value="true">true — showroom ships</option>
              <option value="false">false — Pull sends a label</option>
            </select>
          </div>
        </div>

        <div className={styles.formActions}>
          <button type="submit" className="btn btn-primary">
            Save contact
          </button>
          <Link className="btn btn-ghost" href="/studio/contacts">
            Cancel
          </Link>
          {isDemoSeed ? (
            <span className={`${styles.tag} ${styles.tagDemo}`}>demo seed row</span>
          ) : null}
        </div>
        <p className={styles.fileNote} style={{ marginTop: 10 }}>
          Empty emails are allowed but block sends for this brand. Country must be a 2-letter ISO
          code; the rest is used to pre-fill showroom intake.
        </p>
      </form>
    </section>
  )
}
