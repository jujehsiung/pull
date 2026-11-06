/**
 * Token helpers for /b/[token] — the client link is an HMAC-signed opaque token (PRD §13), and the
 * published job stores the sha256 of the exact token it minted. That hash is what lets the stylist
 * revoke or re-mint a link without rotating LINK_SECRET, so the page checks both.
 */
import { createHash, timingSafeEqual } from "node:crypto"

/** sha256 hex of the raw signed link token — the value stored on `jobs.public_token_hash`. */
export function sha256Hex(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex")
}

/**
 * Constant-time comparison of sha256(rawToken) against the stored hash. A missing or cleared hash
 * counts as a mismatch: this page only renders a link the publish action actually minted.
 */
export function tokenHashMatches(rawToken: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false
  const actual = Buffer.from(sha256Hex(rawToken), "utf8")
  const expected = Buffer.from(storedHash.trim().toLowerCase(), "utf8")
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
