import Link from "next/link"
import { requireStylist } from "@/lib/auth"
import { NewJobForm } from "@/components/studio/NewJobForm"

export const metadata = { title: "Pull — start a job" }

export default async function NewJobPage() {
  await requireStylist()

  return (
    <div style={{ maxWidth: 620 }}>
      <Link href="/studio" className="mono" style={{ color: "var(--muted-foreground)" }}>
        ← DASHBOARD
      </Link>
      <p className="eyebrow" style={{ marginTop: 20 }}>
        START A JOB
      </p>
      <h1 className="display" style={{ margin: "12px 0 0", fontSize: "clamp(28px, 4vw, 40px)" }}>
        What are we pulling for?
      </h1>
      <NewJobForm />
    </div>
  )
}
