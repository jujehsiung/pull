"use client"

import { useEffect, useRef } from "react"

/**
 * The look strip: full-bleed, endless, and grabbable.
 *
 * Why this is rAF and not the CSS animation it used to be: a strip you can take
 * hold of has to stop exactly where the hand is and pick up from there. A
 * keyframe animation carries its own clock, so a drag either fights it or snaps
 * back on release. Here the offset is the only state — the loop is a drift
 * added to it, and a fling is just leftover velocity decaying into that drift.
 *
 * The blur gutters are siblings of the moving track, not part of it: the band
 * slides underneath a filter that never moves.
 *
 * `prefers-reduced-motion`: no drift at all. The strip becomes the plain
 * horizontally-scrollable row it was, and the browser's own scroll does the
 * dragging, so the motion stays entirely under the user's control.
 */

const LOOP_SECONDS = 70 // one full copy of the list — the pace the CSS version ran at
const FLING_FRICTION = 0.9 // per frame; ~0.6s to settle
const FLING_FLOOR = 8 // px/s below which a fling is over
const MAX_FLING = 4000 // px/s — a mouse flick can report an absurd speed

export function LookMarquee({ srcs, className = "" }: { srcs: string[]; className?: string }) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const state = useRef({
    offset: 0,
    half: 0,
    speed: 0,
    velocity: 0,
    dragging: false,
    hovered: false,
    lastX: 0,
    lastT: 0,
    raf: 0,
    reduced: false,
  })

  useEffect(() => {
    const track = trackRef.current
    const strip = stripRef.current
    if (!track || !strip) return
    const s = state.current
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    s.reduced = motion.matches

    // Keep the offset inside one copy of the list, so the seam never shows.
    const wrap = () => {
      if (!s.half) return
      s.offset %= s.half
      if (s.offset > 0) s.offset -= s.half
    }
    const paint = () => {
      track.style.transform = `translate3d(${s.offset.toFixed(2)}px, 0, 0)`
    }
    const measure = () => {
      s.half = track.scrollWidth / 2
      s.speed = s.half / LOOP_SECONDS
      wrap()
      paint()
    }

    let lastFrame = 0
    const frame = (now: number) => {
      const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0
      lastFrame = now
      if (!s.dragging) {
        if (Math.abs(s.velocity) > FLING_FLOOR) {
          s.offset += s.velocity * dt
          s.velocity *= FLING_FRICTION
        } else {
          s.velocity = 0
          if (!s.hovered) s.offset -= s.speed * dt
        }
        wrap()
        paint()
      }
      s.raf = requestAnimationFrame(frame)
    }

    // ── the grab ────────────────────────────────────────────────────────────
    const down = (event: PointerEvent) => {
      if (s.reduced || event.button !== 0) return
      s.dragging = true
      s.lastX = event.clientX
      s.lastT = performance.now()
      s.velocity = 0
      strip.dataset.dragging = "true"
      strip.setPointerCapture(event.pointerId)
    }
    const move = (event: PointerEvent) => {
      if (!s.dragging) return
      const now = performance.now()
      const dx = event.clientX - s.lastX
      const dt = Math.max(now - s.lastT, 1) / 1000
      s.lastX = event.clientX
      s.lastT = now
      s.offset += dx
      s.velocity = Math.max(-MAX_FLING, Math.min(MAX_FLING, dx / dt))
      wrap()
      paint()
    }
    const up = (event: PointerEvent) => {
      if (!s.dragging) return
      s.dragging = false
      delete strip.dataset.dragging
      if (strip.hasPointerCapture(event.pointerId)) strip.releasePointerCapture(event.pointerId)
    }
    const enter = () => {
      s.hovered = true
    }
    const leave = () => {
      s.hovered = false
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)

    strip.addEventListener("pointerdown", down)
    strip.addEventListener("pointermove", move)
    strip.addEventListener("pointerup", up)
    strip.addEventListener("pointercancel", up)
    strip.addEventListener("pointerenter", enter)
    strip.addEventListener("pointerleave", leave)

    if (!s.reduced) s.raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(s.raf)
      observer.disconnect()
      strip.removeEventListener("pointerdown", down)
      strip.removeEventListener("pointermove", move)
      strip.removeEventListener("pointerup", up)
      strip.removeEventListener("pointercancel", up)
      strip.removeEventListener("pointerenter", enter)
      strip.removeEventListener("pointerleave", leave)
    }
  }, [])

  return (
    <section aria-label="Recent looks" className={`strip-frame ${className}`.trim()}>
      <div ref={stripRef} className="strip">
        <div ref={trackRef} className="strip-track">
          {[...srcs, ...srcs].map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${src}-${i}`}
              src={src}
              alt=""
              draggable={false}
              className="strip-item"
              aria-hidden={i >= srcs.length}
            />
          ))}
        </div>
      </div>
      <span className="strip-gutter strip-gutter-left" aria-hidden="true" />
      <span className="strip-gutter strip-gutter-right" aria-hidden="true" />
    </section>
  )
}
