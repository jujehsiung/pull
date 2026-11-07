/**
 * /client — the client's page, as a design surface.
 *
 * The real client link is /b/[token] (signed, DB-backed, approve/pass persisted).
 * This route renders the same layout against the seeded fixture set so the
 * surface can be designed without publishing a board: decisions are local, and
 * "Send approvals" only acknowledges.
 */
import { ClientBoard } from "@/components/client-view/ClientBoard"
import { ShareButton } from "@/components/client-view/ShareButton"
import { seededLooks } from "@/lib/fixtures"

export const metadata = {
  title: "PULL — your looks",
  robots: { index: false, follow: false },
}

export default function ClientPage() {
  return (
    <>
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-3 md:px-10">
          <span className="text-[19px] font-extrabold tracking-[0.01em] text-foreground">
            PULL.
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] tracking-[0.02em] text-muted-foreground sm:inline">
              Private link
            </span>
            <ShareButton
              title="Your PULL lookbook"
              text="The looks Juje pulled for Dune Tour — approve what you love, pass the rest."
            />
          </div>
        </div>
      </div>

      <ClientBoard
        job={{ title: "Dune Tour", client: "Timothée Chalamet", dueDate: "2027-12-01" }}
        looks={seededLooks()}
      />
    </>
  )
}
