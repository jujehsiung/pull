/**
 * /requests — the request-email screen, as a design surface.
 *
 * The real screen is /studio/jobs/[id]/requests (DB-backed, behind the studio
 * session). This route renders it against the seeded fixture set so the screen
 * can be designed without a database: drafts are local and nothing is sent.
 */
import { RequestEmails, type RequestBrand } from "@/components/studio-view/RequestEmails"
import { seededLooks } from "@/lib/fixtures"

export const metadata = { title: "PULL — request emails" }

/** A demo address per house — the contacts book owns the real ones. */
function contactFor(brand: string): string {
  return `pr@${brand.toLowerCase().replace(/[^a-z]/g, "")}.demo`
}

export default function RequestsPage() {
  const looks = seededLooks()

  // The client approved two looks in each of the first three houses — enough of
  // the flow to design the screen against.
  const byBrand = new Map<string, RequestBrand>()
  for (const look of looks) {
    const list = byBrand.get(look.brand) ?? {
      brand: look.brand,
      contactEmail: contactFor(look.brand),
      looks: [],
    }
    if (list.looks.length < 2) {
      list.looks.push({ id: look.id, lookNo: look.lookNo, season: look.season, src: look.src ?? "" })
    }
    byBrand.set(look.brand, list)
  }
  const brands = [...byBrand.values()].slice(0, 3)

  return (
    <RequestEmails
      job={{
        client: "Timothée Chalamet",
        title: "Dune Tour",
        shootDate: "2027-11-12",
        callInDate: "2027-11-09",
        returnDate: "2027-11-22",
        shipTo: "PULL Studio · 12 Mercer St, New York, NY 10013",
      }}
      brands={brands}
    />
  )
}
