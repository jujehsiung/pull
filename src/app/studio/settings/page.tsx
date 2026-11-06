import Link from "next/link"
import { eq } from "drizzle-orm"
import { db } from "@/db/client"
import { users } from "@/db/schema"
import { requireStylist } from "@/lib/auth"
import { saveStudioForm } from "@/server/actions/studio"

export const metadata = { title: "PULL — studio settings" }

const FIELDS: { key: string; label: string; placeholder?: string; required?: boolean; wide?: boolean }[] = [
  { key: "name", label: "Studio name", placeholder: "PULL Studio" },
  { key: "street1", label: "Street", placeholder: "155 Wooster St", required: true },
  { key: "street2", label: "Floor / suite", placeholder: "Floor 3" },
  { key: "city", label: "City", placeholder: "New York", required: true },
  { key: "state", label: "State / region", placeholder: "NY" },
  { key: "zip", label: "ZIP / postcode", placeholder: "10012", required: true },
  { key: "country", label: "Country (2-letter)", placeholder: "US", required: true },
  { key: "phone", label: "Phone (carriers require one for labels)", placeholder: "+1 212 555 0147" },
  { key: "email", label: "Pickup email", placeholder: "studio@example.com" },
]

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const stylist = await requireStylist()
  const query = await searchParams
  const [row] = await db().select().from(users).where(eq(users.id, stylist.id)).limit(1)
  const address = (row?.studioAddress ?? {}) as Record<string, string>

  return (
    <div style={{ maxWidth: 760 }}>
      <Link href="/studio" className="mono" style={{ color: "var(--muted)" }}>
        ← JOBS
      </Link>
      <header style={{ marginTop: 16 }}>
        <p className="eyebrow">STUDIO</p>
        <h1 className="display" style={{ margin: "10px 0 0", fontSize: "clamp(26px, 3.6vw, 38px)" }}>
          Where the looks come back to
        </h1>
        <p className="small" style={{ marginTop: 12, maxWidth: 560 }}>
          This address appears in every request email&apos;s SHOOT DETAILS block, and it is where the
          showroom ships to — it is the destination for every label we quote. Street, city, ZIP and
          country are required.
        </p>
      </header>

      {query.saved && (
        <p className="small" role="status" style={{ color: "var(--ok)", marginTop: 16 }}>
          Saved. New request emails and labels will use this address.
        </p>
      )}
      {query.error && (
        <p className="small" role="alert" style={{ color: "var(--danger)", marginTop: 16 }}>
          {query.error}
        </p>
      )}

      <form action={saveStudioForm} className="card stack" style={{ marginTop: 20, padding: 24, gap: 16 }}>
        <div className="field-grid">
          {FIELDS.map((field) => (
            <div key={field.key} className={`field${field.key === "street1" ? " full" : ""}`}>
              <label htmlFor={`addr-${field.key}`}>
                {field.label}
                {field.required ? " *" : ""}
              </label>
              <input
                id={`addr-${field.key}`}
                name={field.key}
                defaultValue={address[field.key] ?? ""}
                placeholder={field.placeholder}
                required={field.required}
              />
            </div>
          ))}
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <p className="small" style={{ margin: 0, color: "var(--muted-2)" }}>
            Address now on file:{" "}
            {address.street1
              ? [address.name, address.street1, address.street2, address.city, address.state, address.zip, address.country]
                  .filter(Boolean)
                  .join(", ")
              : "(none — requests will say the address is not set)"}
          </p>
          <button type="submit" className="btn btn-primary">
            Save address
          </button>
        </div>
      </form>
    </div>
  )
}
