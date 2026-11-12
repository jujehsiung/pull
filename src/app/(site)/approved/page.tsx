/**
 * /approved — the stylist's read of the client's decision.
 *
 * The record lives in the browser (src/lib/approved-store.ts) until the DB-backed board takes
 * it over, so this page is a client view with a server shell. Reached from the bell.
 */
import { ApprovedView } from "@/components/client-view/ApprovedView"

export const metadata = { title: "Pull — client approval", robots: { index: false, follow: false } }

export default function ApprovedPage() {
  return <ApprovedView />
}
