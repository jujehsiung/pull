/** Small presentation helpers for the intake page. */

export function formatMoney(amount: number, currency: string): string {
  const code = (currency || "USD").toUpperCase()
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${code} ${amount.toFixed(2)}`
  }
}

export function formatDays(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`
}

/** `12 Nov 2026` from an ISO date — the intake never shows a raw 2026-11-12. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return ""
  const [year, month, day] = iso.split("-").map(Number)
  if (!year || !month || !day || !MONTHS[month - 1]) return iso
  return `${day} ${MONTHS[month - 1]} ${year}`
}
