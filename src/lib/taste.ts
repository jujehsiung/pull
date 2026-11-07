/**
 * TASTE — the skill that reads a row and picks the next look to match it.
 *
 * When a look is deleted from a house, the looks that remain are the stylist's answer: the palette
 * they kept, the cloth the pictures read as, and the shape the garment cuts. This module turns a
 * photograph into that signature and scores the reserve against the mean of the kept looks, so the
 * replacement is the nearest thing in the collection rather than the next thing in the list.
 *
 * Everything runs in the browser on a 48×48 canvas: no model call, no upload, no key. The reading
 * has three directions, in the order a stylist names them:
 *
 *   colour   — the dominant family (indigo, charcoal, camel…)
 *   texture  — denim, nylon, wool, leather, cotton, read from grain and sheen
 *   shape    — structured, clean, heavy, light, read from edge density and ink
 *
 * Texture is the coarsest of the three: denim and nylon separate on grain and specular highlights,
 * which a 48px read can see, but it is a read of the photograph, not a fibre test.
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
  /** Dominant hue in degrees (0–360): the centre of the strongest 30° chroma band. */
  hue: number
  /** How much colour the frame carries — saturated garment pixels against the neutral set. */
  chroma: number
  /** Mean neighbour difference — cloth grain: denim and tweed read higher than nylon. */
  grain: number
  /** Share of near-white pixels — sheen, which separates nylon and leather from matte cloth. */
  specular: number
}

export interface TasteTraits {
  color: string[]
  texture: string[]
  shape: string[]
}

export interface TasteCandidate {
  id: string
  src: string
}

const SIZE = 64
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
  const n = signatures.length || 1
  const sum = signatures.reduce(
    (acc, sig) => ({
      tone: acc.tone + sig.tone,
      warmth: acc.warmth + sig.warmth,
      saturation: acc.saturation + sig.saturation,
      ink: acc.ink + sig.ink,
      edge: acc.edge + sig.edge,
      hue: acc.hue + sig.hue,
      chroma: acc.chroma + sig.chroma,
      grain: acc.grain + sig.grain,
      specular: acc.specular + sig.specular,
    }),
    { tone: 0, warmth: 0, saturation: 0, ink: 0, edge: 0, hue: 0, chroma: 0, grain: 0, specular: 0 },
  )
  return {
    tone: sum.tone / n,
    warmth: sum.warmth / n,
    saturation: sum.saturation / n,
    ink: sum.ink / n,
    edge: sum.edge / n,
    hue: sum.hue / n,
    chroma: sum.chroma / n,
    grain: sum.grain / n,
    specular: sum.specular / n,
  }
}

function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return (d > 180 ? 360 - d : d) / 180
}

/** Weighted distance — colour, texture and shape each count; silhouette the most. */
function distance(a: TasteSignature, b: TasteSignature): number {
  return (
    Math.abs(a.tone - b.tone) * 1.0 +
    Math.abs(a.warmth - b.warmth) * 1.0 +
    Math.abs(a.saturation - b.saturation) * 0.8 +
    Math.abs(a.ink - b.ink) * 1.4 +
    Math.abs(a.edge - b.edge) * 2.0 +
    hueGap(a.hue, b.hue) * 1.2 +
    Math.abs(a.chroma - b.chroma) * 0.6 +
    Math.abs(a.grain - b.grain) * 1.2 +
    Math.abs(a.specular - b.specular) * 0.8
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
    // The garment is the middle of a runway frame; the floor and the crowd are not the look.
    const cropWidth = image.width * 0.5
    const cropHeight = image.height * 0.78
    context.drawImage(
      image,
      (image.width - cropWidth) / 2,
      image.height * 0.1,
      cropWidth,
      cropHeight,
      0,
      0,
      SIZE,
      SIZE,
    )
    const { data } = context.getImageData(0, 0, SIZE, SIZE)

    let red = 0
    let green = 0
    let blue = 0
    let saturation = 0
    let ink = 0
    let specular = 0
    const hueBins = new Array(12).fill(0)
    let chromaSum = 0
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
      const chroma = max - min
      saturation += max ? chroma / max : 0
      if (l < 0.22) ink += 1
      if (l > 0.88) specular += 1
      if (chroma > 0.1) {
        let hue = 0
        if (max === r) hue = ((g - b) / chroma) % 6
        else if (max === g) hue = (b - r) / chroma + 2
        else hue = (r - g) / chroma + 4
        hue *= 60
        if (hue < 0) hue += 360
        // The garment is usually the most saturated thing in the frame, so the dominant colour is
        // the strongest band of saturated pixels, not the mean of a frame that is mostly backdrop.
        hueBins[Math.floor(hue / 30) % 12] += chroma
        chromaSum += chroma
      }
    }

    let edge = 0
    let grain = 0
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const index = y * SIZE + x
        if (x > 0) grain += Math.abs(luminance[index] - luminance[index - 1])
        if (y > 0) grain += Math.abs(luminance[index] - luminance[index - SIZE])
        if (x > 0 && y > 0) {
          edge += Math.abs(luminance[index] - luminance[index - 1])
          edge += Math.abs(luminance[index] - luminance[index - SIZE])
        }
      }
    }

    const pixels = SIZE * SIZE
    const strongest = hueBins.indexOf(Math.max(...hueBins))
    const hue = strongest >= 0 && chromaSum > 0 ? strongest * 30 + 15 : 0
    const signature: TasteSignature = {
      tone: (red + green + blue) / (3 * pixels),
      warmth: (red - blue) / pixels / 2 + 0.5,
      saturation: saturation / pixels,
      ink: ink / pixels,
      edge: edge / (2 * pixels),
      hue,
      chroma: chromaSum / pixels,
      grain: grain / (2 * pixels),
      specular: specular / pixels,
    }
    cache.set(src, signature)
    return signature
  } catch {
    return null
  }
}

/** The words a signature reads as, in the three directions. */
export function traitsOf(signature: TasteSignature): TasteTraits {
  const color: string[] = []
  if (signature.saturation < 0.14 || signature.chroma < 0.05) {
    if (signature.tone < 0.18) color.push("black")
    else if (signature.tone < 0.34) color.push("charcoal")
    else if (signature.tone < 0.62) color.push("grey")
    else if (signature.tone < 0.82) color.push("stone")
    else color.push("white")
  } else {
    const hue = signature.hue
    if (hue < 15 || hue >= 345) color.push("red")
    else if (hue < 35) color.push("rust")
    else if (hue < 50) color.push("tan")
    else if (hue < 70) color.push("olive")
    else if (hue < 160) color.push("green")
    else if (hue < 195) color.push("teal")
    else if (hue < 245) color.push("blue")
    else if (hue < 275) color.push("indigo")
    else if (hue < 305) color.push("violet")
    else if (hue < 330) color.push("pink")
    else color.push("crimson")
    if (signature.tone < 0.25) color.push("near-black")
    if (signature.saturation < 0.22) color.push("muted")
  }

  const texture: string[] = []
  const blue = signature.hue > 190 && signature.hue < 260
  if (blue && signature.chroma > 0.02) texture.push("denim")
  else if (signature.specular > 0.05 && signature.grain < 0.05)
    texture.push(signature.tone < 0.4 ? "leather" : "nylon")
  else if (signature.grain > 0.07 && signature.edge > 0.09) texture.push("wool")
  else if (signature.grain < 0.03) texture.push("smooth")
  else texture.push("cotton")

  const shape: string[] = []
  if (signature.edge > 0.095) shape.push("structured")
  else if (signature.edge < 0.055) shape.push("clean")
  if (signature.ink > 0.3) shape.push("heavy")
  else if (signature.ink < 0.08) shape.push("light")
  if (!shape.length) shape.push("soft")

  return { color: color.slice(0, 2), texture: texture.slice(0, 1), shape: shape.slice(0, 2) }
}

/**
 * The pattern across a set of looks — the chips at the top of the board. It needs a few images to
 * be a pattern at all, so fewer than three reads as no pattern rather than a confident claim.
 */
export async function readBoardTaste(srcs: string[], limit = 80): Promise<TasteTraits | null> {
  const signatures = (await Promise.all(srcs.slice(0, limit).map((src) => readTaste(src)))).filter(
    (sig): sig is TasteSignature => Boolean(sig),
  )
  if (signatures.length < 3) return null
  // A row is usually mixed (a denim look beside a wool one), so the chips vote: what most of the
  // pictures read as, rather than the average of everything, which belongs to no look at all.
  const traits = signatures.map(traitsOf)
  return {
    color: majority(traits.flatMap((entry) => entry.color.slice(0, 1)), 2),
    texture: majority(traits.flatMap((entry) => entry.texture), 1),
    shape: majority(traits.flatMap((entry) => entry.shape), 2),
  }
}

function majority(values: string[], take = 1): string[] {
  const counts = new Map<string, number>()
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, take)
    .map(([value]) => value)
}

/** The mean signature of a set of looks — what the board reads as, before it is put into words. */
export async function centreOf(srcs: string[], limit = 80): Promise<TasteSignature | null> {
  const signatures = (await Promise.all(srcs.slice(0, limit).map((src) => readTaste(src)))).filter(
    (sig): sig is TasteSignature => Boolean(sig),
  )
  if (signatures.length < 3) return null
  return mean(signatures)
}

/** Indices of `candidates`, nearest to a centre first — the order a reseed picks in. */
export async function rankByTaste(centre: TasteSignature, candidates: string[]): Promise<number[]> {
  const signatures = await Promise.all(candidates.map((src) => readTaste(src)))
  return signatures
    .map((signature, index) => ({
      index,
      distance: signature ? distance(centre, signature) : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.distance - b.distance)
    .map((entry) => entry.index)
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
 * One line for the header: which look and what the row it joined reads as. It describes the row,
 * not a claim that the pick matches every axis — the signature is coarse and the point is that the
 * nearest look was taken, not that a stylist would agree with every word.
 */
export async function describeTaste(kept: TasteCandidate[], chosen: TasteCandidate): Promise<string> {
  const signatures = (await Promise.all(kept.slice(0, 8).map((look) => readTaste(look.src)))).filter(
    (sig): sig is TasteSignature => Boolean(sig),
  )
  const pick = await readTaste(chosen.src)
  if (!pick || signatures.length < 2) return "nearest look in the collection"
  const traits = signatures.map(traitsOf)
  const words = [
    majority(traits.flatMap((entry) => entry.color.slice(0, 1)))[0],
    majority(traits.flatMap((entry) => entry.texture))[0],
    majority(traits.flatMap((entry) => entry.shape))[0],
  ].filter(Boolean)
  return words.length ? `closest to the row's ${words.join(", ")}` : "nearest look in the collection"
}
