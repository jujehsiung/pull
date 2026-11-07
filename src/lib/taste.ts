/**
 * TASTE — the skill that reads a row and picks the next look to match it.
 *
 * When a look is deleted from a house, the looks that remain are the stylist's answer: the palette
 * they kept, how dark the image sits, how much of the frame the garment fills. This module turns a
 * photograph into that small signature and scores the reserve against the mean of the kept looks, so
 * the replacement is the nearest thing in the collection rather than the next thing in the list.
 *
 * Everything runs in the browser on a 48×48 canvas: no model call, no upload, no key. The signature
 * is intentionally coarse — tone, warmth, saturation, ink (how much of the frame is near-black, a
 * silhouette proxy) and edge density (how much structure the image carries).
 */

export interface TasteSignature {
  /** Mean luminance, 0 (black) → 1 (white). */
  tone: number
  /** Red-versus-blue balance, 0 (cool) → 1 (warm). */
  warmth: number
  /** Mean saturation, 0 → 1. */
  saturation: number
  /** Share of near-black pixels — a dark garment reads higher than a pale one. */
  ink: number
  /** Mean gradient magnitude — busy, structured images read higher than flat ones. */
  edge: number
}

export interface TasteCandidate {
  id: string
  src: string
}

const SIZE = 48
const cache = new Map<string, TasteSignature>()

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.decoding = "async"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not read ${src}`))
    image.src = src
  })
}

function mean(signatures: TasteSignature[]): TasteSignature {
  const sum = signatures.reduce(
    (acc, sig) => ({
      tone: acc.tone + sig.tone,
      warmth: acc.warmth + sig.warmth,
      saturation: acc.saturation + sig.saturation,
      ink: acc.ink + sig.ink,
      edge: acc.edge + sig.edge,
    }),
    { tone: 0, warmth: 0, saturation: 0, ink: 0, edge: 0 },
  )
  const n = signatures.length || 1
  return {
    tone: sum.tone / n,
    warmth: sum.warmth / n,
    saturation: sum.saturation / n,
    ink: sum.ink / n,
    edge: sum.edge / n,
  }
}

/** Weighted distance: silhouette (edge + ink) is what a stylist means by "the same hand". */
function distance(a: TasteSignature, b: TasteSignature): number {
  return (
    Math.abs(a.tone - b.tone) * 1.0 +
    Math.abs(a.warmth - b.warmth) * 1.2 +
    Math.abs(a.saturation - b.saturation) * 0.8 +
    Math.abs(a.ink - b.ink) * 1.4 +
    Math.abs(a.edge - b.edge) * 2.0
  )
}

/** Read one photograph. Cached by URL: the board re-reads the same looks on every delete. */
export async function readTaste(src: string): Promise<TasteSignature | null> {
  const hit = cache.get(src)
  if (hit) return hit
  try {
    const image = await loadImage(src)
    const canvas = document.createElement("canvas")
    canvas.width = SIZE
    canvas.height = SIZE
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return null
    context.drawImage(image, 0, 0, SIZE, SIZE)
    const { data } = context.getImageData(0, 0, SIZE, SIZE)

    let red = 0
    let green = 0
    let blue = 0
    let saturation = 0
    let ink = 0
    const luminance = new Float32Array(SIZE * SIZE)
    for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
      const r = data[i] / 255
      const g = data[i + 1] / 255
      const b = data[i + 2] / 255
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
      luminance[pixel] = l
      red += r
      green += g
      blue += b
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      saturation += max ? (max - min) / max : 0
      if (l < 0.22) ink += 1
    }

    let edge = 0
    for (let y = 1; y < SIZE; y += 1) {
      for (let x = 1; x < SIZE; x += 1) {
        const index = y * SIZE + x
        edge += Math.abs(luminance[index] - luminance[index - 1])
        edge += Math.abs(luminance[index] - luminance[index - SIZE])
      }
    }

    const pixels = SIZE * SIZE
    const signature: TasteSignature = {
      tone: (red + green + blue) / (3 * pixels),
      warmth: (red - blue) / pixels / 2 + 0.5,
      saturation: saturation / pixels,
      ink: ink / pixels,
      edge: edge / (2 * pixels),
    }
    cache.set(src, signature)
    return signature
  } catch {
    return null
  }
}

/**
 * Index of the reserve look closest to what the row kept. `0` when nothing can be read — the caller
 * falls back to the next look in the collection, which is the old behaviour.
 */
export async function nearestToTaste(
  kept: TasteCandidate[],
  candidates: TasteCandidate[],
  limit = 8,
): Promise<number> {
  if (!candidates.length) return 0
  const keptSignatures = (await Promise.all(kept.slice(0, limit).map((look) => readTaste(look.src)))).filter(
    (sig): sig is TasteSignature => Boolean(sig),
  )
  if (keptSignatures.length < 2) return 0
  const centre = mean(keptSignatures)

  const signatures = await Promise.all(candidates.slice(0, limit).map((look) => readTaste(look.src)))
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  signatures.forEach((signature, index) => {
    if (!signature) return
    const d = distance(centre, signature)
    if (d < bestDistance) {
      bestDistance = d
      best = index
    }
  })
  return best >= 0 ? best : 0
}

/**
 * One line for the header: what the kept row reads as, so the choice is legible. It describes the
 * row, not a claim that the pick matches every axis — the signature is coarse and the point is that
 * the nearest look was taken, not that a stylist would agree with every word.
 */
export async function describeTaste(kept: TasteCandidate[], chosen: TasteCandidate): Promise<string> {
  const signatures = (await Promise.all(kept.slice(0, 8).map((look) => readTaste(look.src)))).filter(
    (sig): sig is TasteSignature => Boolean(sig),
  )
  const pick = await readTaste(chosen.src)
  if (!pick || signatures.length < 2) return "nearest look in the collection"
  const centre = mean(signatures)
  const traits: string[] = []
  if (centre.tone < 0.4) traits.push("dark")
  else if (centre.tone > 0.62) traits.push("pale")
  if (Math.abs(centre.warmth - 0.5) > 0.05) traits.push(centre.warmth > 0.5 ? "warm" : "cool")
  if (centre.ink > 0.28) traits.push("heavy garment")
  if (centre.edge > 0.09) traits.push("dense silhouette")
  else if (centre.edge < 0.05) traits.push("clean silhouette")
  return traits.length
    ? `closest to the row's ${traits.slice(0, 3).join(", ")}`
    : "nearest look in the collection"
}
