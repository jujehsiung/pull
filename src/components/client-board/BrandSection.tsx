/**
 * A brand section on the client board: the brand head (name + season/count meta, hairline rule from
 * the global .brand-section) and its look grid.
 */
import type { ReactNode } from "react"
import { LookCard } from "./LookCard"
import type { LookCardLook } from "./types"
import styles from "./client-board.module.css"

function seasonMeta(looks: LookCardLook[]): string {
  const seasons = Array.from(
    new Set(
      looks
        .map((look) => look.season?.trim().toUpperCase())
        .filter((season): season is string => Boolean(season)),
    ),
  )
  const count = `${looks.length} ${looks.length === 1 ? "look" : "looks"}`
  return seasons.length > 0 ? `${seasons.join(" / ")} · ${count}` : count
}

interface BrandSectionProps {
  brand: string
  looks: LookCardLook[]
  /** Index of this section's first look within the whole board (only look 0 is eager). */
  startIndex: number
  /** Per-look review controls (open review) or read-only summary (locked). */
  actionsFor?: (look: LookCardLook, index: number) => ReactNode
}

export function BrandSection({ brand, looks, startIndex, actionsFor }: BrandSectionProps) {
  return (
    <section className="brand-section" aria-label={`${brand} — ${seasonMeta(looks)}`}>
      <div className="brand-head">
        <h2 className={styles.brandHeading}>{brand}</h2>
        <span className="brand-meta">{seasonMeta(looks)}</span>
      </div>

      <div className={styles.lookGrid}>
        {looks.map((look, index) => (
          <LookCard
            key={look.id}
            look={look}
            priority={startIndex + index === 0}
            actions={actionsFor?.(look, startIndex + index)}
          />
        ))}
      </div>
    </section>
  )
}
