/**
 * Board image delivery for the client page.
 *
 * `boardImageUrl` applies the Cloudinary trim + portrait crop and delivers WebP/auto at the asked
 * width (FR-9 budget), so we hand the browser a small srcset instead of one oversized tile.
 * Widths are the actual crop widths, so the `w` descriptors are honest; every URL keeps a 3:4 crop.
 */
import { boardImageUrl } from "@/lib/cloudinary"

/** Width of the base <img>; the crop is always 3:4 (see boardImageUrl). */
export const BOARD_IMAGE_WIDTH = 900
export const BOARD_IMAGE_HEIGHT = 1200

const SRCSET_WIDTHS = [360, 540, 720, 1080] as const

export interface BoardImageSources {
  src: string
  srcSet: string
}

/**
 * Null when there is no public id, and also when Cloudinary is not configured — a missing CDN
 * config must not 500 the client's board, the tile just renders as a placeholder.
 */
export function boardImage(publicId: string | null): BoardImageSources | null {
  if (!publicId) return null
  try {
    return {
      src: boardImageUrl(publicId, BOARD_IMAGE_WIDTH),
      srcSet: SRCSET_WIDTHS.map((width) => `${boardImageUrl(publicId, width)} ${width}w`).join(", "),
    }
  } catch {
    return null
  }
}
