/** Read side of the client review, for the stylist's report (FR-12). */
import { and, asc, eq, ne } from "drizzle-orm"
import { db } from "@/db/client"
import { looks } from "@/db/schema"

export interface ReviewReport {
  approved: number
  passed: number
  undecided: number
  mustHaves: number
  /** Approved looks, strongest priority first, then by look number. */
  shortlist: { id: string; lookNo: number; brand: string; season: string | null; priority: number | null }[]
  /** Every note, attached to its look and brand. */
  notes: { id: string; lookNo: number; brand: string; status: string; note: string }[]
  /** Brands that have at least one approved look — the ones Act 2 will draft for. */
  brands: { brand: string; approved: number }[]
}

export async function getReviewReport(jobId: string): Promise<ReviewReport> {
  const rows = await db().select().from(looks).where(eq(looks.jobId, jobId)).orderBy(asc(looks.lookNo))

  const visible = rows.filter((row) => row.hiddenAt === null)
  const approvedRows = visible.filter((row) => row.status === "approved")
  const priorityRank = (priority: number | null) => (priority === null ? 99 : -priority)

  const brands = new Map<string, number>()
  for (const row of approvedRows) brands.set(row.brand, (brands.get(row.brand) ?? 0) + 1)

  return {
    approved: approvedRows.length,
    passed: visible.filter((row) => row.status === "passed").length,
    undecided: visible.filter((row) => row.status === "draft").length,
    mustHaves: approvedRows.filter((row) => (row.priority ?? 0) >= 2).length,
    shortlist: approvedRows
      .slice()
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.lookNo - b.lookNo)
      .map((row) => ({
        id: row.id,
        lookNo: row.lookNo,
        brand: row.brand,
        season: row.season,
        priority: row.priority,
      })),
    notes: visible
      .filter((row) => (row.clientNote ?? "").trim().length > 0)
      .map((row) => ({
        id: row.id,
        lookNo: row.lookNo,
        brand: row.brand,
        status: row.status,
        note: (row.clientNote ?? "").trim(),
      })),
    brands: [...brands.entries()].map(([brand, approved]) => ({ brand, approved })).sort((a, b) => a.brand.localeCompare(b.brand)),
  }
}

/** Looks the client passed on — shown separately so the stylist can see what not to request. */
export async function passedLooks(jobId: string) {
  return db()
    .select()
    .from(looks)
    .where(and(eq(looks.jobId, jobId), eq(looks.status, "passed"), ne(looks.status, "draft")))
}
