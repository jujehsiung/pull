#!/usr/bin/env node
/**
 * fetch-menswear — pull men's runway looks from Vogue Runway into the demo fixtures.
 *
 * Run: node scripts/fetch-menswear.mjs [--season fall-2026-menswear] [--per-brand 8]
 *
 * WHY THIS EXISTS
 * The seeded fixture set (public/fixtures/looks) is the PRD FR-4 acceptance set:
 * 10 synthetic screenshots that carry their own caption text so OCR can prove it
 * reads "Look 27 — AW26" off the pixels. Those are the wrong images to put in
 * front of a client — they are test cards. This script fetches real menswear
 * photographs instead, for the client board.
 *
 * NAMING
 * Files are written as `<brand>_look_<n>_<season>.jpg` because that is exactly
 * what src/lib/agent/parse.ts already understands: the underscore form is
 * normalised to spaces, the look number is read from `look N`, the season from
 * `aw26`, and the house from the first two surviving words. A real photograph
 * carries no caption text, so these land as `readSource: "filename"` at 0.64
 * confidence — which is the honest label, and visible in the UI on purpose.
 *
 * RIGHTS
 * These are Condé Nast editorial images, not stock. They are demo fixtures for a
 * private build; each row in the manifest keeps its source page and the
 * photographer credit from the filename. Do not redistribute them or ship them
 * in a public repo without clearing usage.
 */
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const SEASON_SLUG = arg("season", "fall-2026-menswear")
const PER_BRAND = Number(arg("per-brand", "10"))
const SEASON_CODE = SEASON_SLUG.startsWith("fall") ? `AW${SEASON_SLUG.match(/(\d{4})/)[1].slice(2)}` : `SS${SEASON_SLUG.match(/(\d{4})/)[1].slice(2)}`
const OUT = join(process.cwd(), "public", "fixtures", "menswear")

/**
 * The roster is chosen for a Timothée Chalamet board: the house he is an
 * ambassador for, the houses he wears on a carpet, and the young menswear
 * labels around him. Keep 6-8; each one becomes a brand board.
 */
const BRANDS = [
  { slug: "louis-vuitton", key: "louis_vuitton", name: "Louis Vuitton" },
  { slug: "prada", key: "prada", name: "Prada" },
  { slug: "dior-homme", key: "dior_homme", name: "Dior Homme" },
  { slug: "saint-laurent", key: "saint_laurent", name: "Saint Laurent" },
  { slug: "martine-rose", key: "martine_rose", name: "Martine Rose" },
  { slug: "hed-mayner", key: "hed_mayner", name: "Hed Mayner" },
]

const get = async (url, accept = "text/html") => {
  const res = await fetch(url, { headers: { "user-agent": UA, accept } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res
}

/**
 * Build a large URL per look.
 *
 * The gallery inlines only THUMBNAILS in its srcSet (w_120/240/320/360); the
 * large variants are fetched by the client later. But the asset path is
 * deterministic — `photos/<photo-id>/master/w_<width>,c_limit/<filename>` — so
 * the thumbnail gives us both the photo id and the filename, and any width can
 * be constructed from them. Reading the srcSet for a big width instead returned
 * 3 looks out of 81, because only the hero images inline one.
 *
 * `-detail-` assets are cropped close-ups of the same look; they are not looks.
 */
const TARGET_WIDTH = "960"

function looksFrom(html) {
  const text = html.replace(/%2C/g, ",")
  const re =
    /https:\/\/assets\.vogue\.com\/photos\/([a-z0-9]+)\/master\/w_\d+,c_limit\/(\d{5})-[^"\\ ]+?\.jpg/g
  const found = new Map() // look number -> { url, credit }
  for (const m of text.matchAll(re)) {
    const [, photoId, lookNo] = m
    const filename = m[0].slice(m[0].lastIndexOf("/") + 1)
    if (/-(detail|back)-/i.test(filename)) continue
    if (found.has(lookNo)) continue
    found.set(lookNo, {
      url: `https://assets.vogue.com/photos/${photoId}/master/w_${TARGET_WIDTH},c_limit/${filename}`,
      credit: /credit-([a-z]+)\.jpg$/i.exec(filename)?.[1] ?? "unknown",
    })
  }
  return found
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const manifest = {
    note:
      `Real men's runway looks, ${SEASON_CODE}, crawled from Vogue Runway. ` +
      `Editorial images (Conde Nast) — demo fixtures, keep the repo private. ` +
      `Filenames follow the parser convention, so no caption text is required.`,
    season: SEASON_CODE,
    source: `https://www.vogue.com/fashion-shows/${SEASON_SLUG}`,
    fetchedAt: new Date().toISOString(),
    files: [], // loader shape: plain names, consumed by loadSampleFiles()
    assets: [], // the same rows with brand / look / credit for attribution
  }

  for (const brand of BRANDS) {
    const pageUrl = `https://www.vogue.com/fashion-shows/${SEASON_SLUG}/${brand.slug}`
    process.stdout.write(`${brand.name.padEnd(16)} `)
    let html
    try {
      html = await (await get(pageUrl)).text()
    } catch (err) {
      console.log(`skipped — ${err.message}`)
      continue
    }

    // The collection page previews only ~6 looks. The full runway gallery is
    // `/slideshow/collection`; fall back to the preview if that 404s.
    let images = looksFrom(html)
    try {
      const gallery = await (await get(`${pageUrl}/slideshow/collection`)).text()
      const full = looksFrom(gallery)
      if (full.size > images.size) images = full
    } catch {
      /* keep the preview set */
    }
    if (!images.size) {
      console.log("no look images found")
      continue
    }

    const picks = [...images.entries()]
      .map(([no, meta]) => ({ no: Number(no), ...meta }))
      .sort((a, b) => a.no - b.no)
      .slice(0, PER_BRAND)

    let saved = 0
    for (const look of picks) {
      const filename = `${brand.key}_look_${look.no}_${SEASON_CODE.toLowerCase()}.jpg`
      try {
        const res = await get(look.url, "image/jpeg,image/*")
        const buf = Buffer.from(await res.arrayBuffer())
        await writeFile(join(OUT, filename), buf)
        const credit = look.credit
        manifest.files.push(filename)
        manifest.assets.push({
          file: filename,
          brand: brand.name,
          lookNo: look.no,
          season: SEASON_CODE,
          credit,
          sourcePage: pageUrl,
        })
        saved++
      } catch (err) {
        console.log(`  ! look ${look.no}: ${err.message}`)
      }
    }
    console.log(`${saved}/${picks.length} looks`)
  }

  await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n")
  console.log(`\n  ${manifest.files.length} images -> public/fixtures/menswear/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
