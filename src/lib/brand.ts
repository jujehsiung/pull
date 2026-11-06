/**
 * Brand names arrive from three places with three different casings: the OCR/parse pipeline
 * canonicalises to Title Case ("Bottega Veneta"), the contacts seed and CSV import use upper case
 * ("BOTTEGA VENETA"), and a stylist can type anything. They all mean the same house, so comparison
 * must be case- and whitespace-insensitive while display keeps whatever the source used.
 *
 * Found by the M4 Playwright run: a freshly imported job produced drafts with contactId = null and
 * shippingMode = "unknown", which meant no intake link and therefore no Act 3 for any imported job.
 */
export function brandKey(brand: string | null | undefined): string {
  return (brand ?? "").trim().toLowerCase().replace(/\s+/g, " ")
}

export function sameBrand(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = brandKey(a)
  return left.length > 0 && left === brandKey(b)
}
