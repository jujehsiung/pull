import { SiteHeader } from "@/components/SiteHeader"

/**
 * The public site chrome.
 *
 * The header is rendered here, once, for every route in this group — so it
 * persists across navigation instead of being re-pasted into each page. Routes
 * outside the group (studio, the dark client board, intake) own their chrome
 * and are deliberately not in here.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  )
}
