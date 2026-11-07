#!/usr/bin/env node
/**
 * tokens:check — the Pull token gate.
 *
 * Three things a theme claims, and this script is the reason it cannot lie:
 *
 *  1. COMPLETE. Every token the kit's @theme mapping consumes must be defined by
 *     the Pull theme. A theme that omits one does not error — it silently falls
 *     back to Dark EVA (Unit-01), so a sidebar or a chart sits in the wrong
 *     palette while nothing throws. The required list is READ FROM
 *     src/styles/eva/theme.css, so it tracks the kit instead of drifting.
 *  2. LEGIBLE. Declared text/background pairs clear WCAG AA. Contrast is the
 *     claim a design system most often ships unverified; #8f8b85 on paper
 *     (3.22:1, the original --muted-2) is why this exists.
 *  3. RESOLVED. Every var(--token) referenced in src/ resolves to something.
 *     A typo in a token name is invisible at runtime — the property just
 *     silently drops — so it gets caught here.
 *
 * Run: npm run tokens:check   (exit 1 = the theme is not shippable)
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, extname } from "node:path"

const ROOT = process.cwd()
const THEME = join(ROOT, "src/styles/pull-theme.css")
const KIT = join(ROOT, "src/styles/eva/theme.css")
const BRIDGE = join(ROOT, "src/styles/pull-bridge.css")
const SRC = join(ROOT, "src")

const read = (p) => readFileSync(p, "utf8")

/* ── css parsing ─────────────────────────────────────────────────────────── */

/** Pull the declarations out of the first block whose selector matches. */
function block(css, selectorSubstring) {
  const lines = css.split("\n")
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.includes(selectorSubstring) && line.includes("{")) {
      const out = {}
      i++
      while (i < lines.length && !lines[i].trim().startsWith("}")) {
        const m = lines[i].match(/^\s*(--[a-z0-9-]+)\s*:\s*(.+?);\s*(?:\/\*.*\*\/)?\s*$/)
        if (m) out[m[1]] = m[2].trim()
        i++
      }
      return out
    }
    i++
  }
  return null
}

/** Every declaration in a file, last wins — enough for alias resolution. */
function allDecls(css) {
  const out = {}
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/g)) out[m[1]] = m[2].trim()
  return out
}

/* ── colour maths ────────────────────────────────────────────────────────── */

const toRgb = (hex) => {
  const h = hex.replace("#", "")
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
}
const chan = (c) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const lum = (hex) => {
  const [r, g, b] = toRgb(hex).map(chan)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const isHex = (v) => /^#[0-9a-f]{3,8}$/i.test(v)

/** Follow var(--a) → var(--b) → #hex until we hit a literal or give up. */
function resolve(value, scope, seen = new Set()) {
  let v = value
  while (v) {
    const m = v.match(/^var\((--[a-z0-9-]+)\)$/)
    if (!m) return v
    if (seen.has(m[1])) return null
    seen.add(m[1])
    v = scope[m[1]]
  }
  return null
}

/* ── 1. required tokens, read from the kit ───────────────────────────────── */

const kitCss = read(KIT)
const required = new Set()
for (const m of kitCss.matchAll(/--color-([a-z0-9-]+)\s*:\s*var\((--[a-z0-9-]+)\)/g)) {
  required.add(m[2])
}
// shape + type the kit's @theme also consumes
for (const extra of ["--radius", "--font-sans", "--font-mono"]) required.add(extra)

const themeCss = read(THEME)
const light = block(themeCss, '[data-eva-theme="pull"] {')
const dark = block(themeCss, '[data-eva-theme="pull"][data-mode="dark"]')

if (!light) fail("could not parse the light block from pull-theme.css")
if (!dark) fail("could not parse the dark block from pull-theme.css")

const problems = []
const missing = [...required].filter((t) => !(t in light))
if (missing.length) problems.push(`light theme is incomplete — missing ${missing.length}: ${missing.join(", ")}`)

// Shape + type do not vary by mode, so only the colour half is required twice.
const SHAPE_AND_TYPE = new Set(["--radius", "--font-sans", "--font-mono"])
const missingDark = [...required].filter((t) => !SHAPE_AND_TYPE.has(t) && !(t in dark))
if (missingDark.length) problems.push(`dark theme is incomplete — missing ${missingDark.length}: ${missingDark.join(", ")}`)

/* ── 1b. case — no all caps (DESIGN.md §4) ──────────────────────────────── */

const CASE_EXEMPT = /\/\/\s*case-exempt:\s*data/
const caseProblems = []
for (const file of walk(SRC)) {
  if (!/\.(tsx?|css)$/.test(file)) continue
  const rel = file.slice(ROOT.length + 1)
  const lines = readFileSync(file, "utf8").split("\n")
  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`
    if (/\.css$/.test(file) && /text-transform:\s*uppercase/.test(line)) {
      caseProblems.push(`${at} — text-transform: uppercase`)
    }
    if (/\.tsx$/.test(file)) {
      if (/uppercase/.test(line) && /className|tracking-\[/.test(line) && !CASE_EXEMPT.test(line)) {
        caseProblems.push(`${at} — uppercase class`)
      }
      if (/\.toUpperCase\(\)/.test(line) && !CASE_EXEMPT.test(line)) {
        caseProblems.push(`${at} — display toUpperCase()`)
      }
    }
  })
}
if (caseProblems.length) {
  problems.push(`all caps found (DESIGN.md §4) — ${caseProblems.length}:\n    ${caseProblems.slice(0, 12).join("\n    ")}`)
}

/* ── 2. contrast pairs ───────────────────────────────────────────────────── */

const PAIRS = [
  // [foreground token, background token, mode, label]
  ["--foreground", "--background", "light", "body text on paper"],
  ["--foreground", "--card", "light", "body text on card"],
  ["--muted-foreground", "--background", "light", "secondary text on paper"],
  ["--muted-foreground", "--card", "light", "secondary text on card"],
  ["--muted-foreground", "--muted", "light", "secondary text on muted surface"],
  ["--muted-foreground-soft", "--background", "light", "eyebrow/meta on paper"],
  ["--muted-foreground-soft", "--card", "light", "eyebrow/meta on card"],
  ["--muted-foreground-soft", "--muted", "light", "eyebrow/meta on muted surface"],
  ["--brand", "--background", "light", "olive emphasis on paper"],
  ["--brand", "--accent", "light", "olive on selection surface"],
  ["--primary-foreground", "--primary", "light", "ink button label"],
  ["--accent-foreground", "--accent", "light", "label on selection surface"],
  ["--tertiary-text", "--background", "light", "destructive ink on paper"],
  ["--destructive", "--card", "light", "destructive on card"],
  ["--success", "--background", "light", "success on paper"],
  ["--warning", "--background", "light", "warning on paper"],
  ["--info", "--background", "light", "info on paper"],
  ["--dark-text", "--dark", "light", "lookbook text on lookbook"],
  ["--dark-muted", "--dark", "light", "lookbook muted on lookbook"],
  ["--dark-muted", "--dark-2", "light", "lookbook muted on lookbook card"],
  ["--dark-ok", "--dark", "light", "lookbook confirmed on lookbook"],

  ["--foreground", "--background", "dark", "body text on dark"],
  ["--muted-foreground", "--background", "dark", "secondary text on dark"],
  ["--muted-foreground", "--muted", "dark", "secondary on dark muted"],
  ["--muted-foreground-soft", "--background", "dark", "eyebrow on dark"],
  ["--muted-foreground-soft", "--muted", "dark", "eyebrow on dark muted"],
  ["--brand", "--background", "dark", "olive emphasis on dark"],
  ["--accent-foreground", "--accent", "dark", "label on dark selection"],
  ["--primary-foreground", "--primary", "dark", "light button label"],
  ["--destructive", "--background", "dark", "destructive on dark"],
  ["--success", "--background", "dark", "success on dark"],
  ["--warning", "--background", "dark", "warning on dark"],
  ["--info", "--background", "dark", "info on dark"],
]

/* dark scope = kit defaults overridden by the dark block; light scope = kit
   defaults overridden by the light block, then the bridge aliases. */
const kitDecls = allDecls(kitCss)
const bridgeDecls = allDecls(read(BRIDGE))
const lightScope = { ...kitDecls, ...light, ...bridgeDecls }
const darkScope = { ...kitDecls, ...light, ...dark, ...bridgeDecls }

const results = []
for (const [fg, bg, mode, label] of PAIRS) {
  const scope = mode === "light" ? lightScope : darkScope
  const a = resolve(scope[fg], scope)
  const b = resolve(scope[bg], scope)
  if (!a || !b || !isHex(a) || !isHex(b)) {
    problems.push(`${mode}: cannot resolve ${fg} / ${bg} to hex (${a} / ${b})`)
    continue
  }
  const ratio = contrast(a, b)
  results.push({ mode, label, ratio, pass: ratio >= 4.5 })
  if (ratio < 4.5) problems.push(`${mode}: ${label} — ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs 4.5`)
}

/* ── 3. every referenced var resolves ────────────────────────────────────── */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if ([".css", ".tsx", ".ts"].includes(extname(p))) out.push(p)
  }
  return out
}

const files = walk(SRC)
// A token can also be DEFINED at runtime: Radix-style components set scoped
// custom properties through a React style object, e.g.
//   style={{ "--toggle-group-gap": "0.5rem" }}
// Those are real declarations, so the scan counts them (quoted form) as well.
const defined = new Set()
for (const f of files) {
  const text = read(f)
  for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1])
  for (const m of text.matchAll(/["'](--[a-z0-9-]+)["']\s*:/g)) defined.add(m[1])
}

const dangling = []
for (const f of files) {
  const text = read(f)
  for (const m of text.matchAll(/var\((--[a-z0-9-]+)/g)) {
    if (!defined.has(m[1]) && !(m[1] in lightScope)) {
      dangling.push(`${f.replace(ROOT + "/", "")}: ${m[1]}`)
    }
  }
}
if (dangling.length) problems.push(`undefined token references (${dangling.length}):\n    ` + [...new Set(dangling)].join("\n    "))

/* ── report ──────────────────────────────────────────────────────────────── */

const pad = (s, n) => String(s).padEnd(n)
console.log(`\n  PULL tokens — ${required.size} required, ${results.length} contrast pairs\n`)
let lastMode = null
for (const r of results) {
  if (r.mode !== lastMode) {
    console.log(`  ${r.mode.toUpperCase()}`)
    lastMode = r.mode
  }
  console.log(`    ${r.pass ? "ok  " : "FAIL"}  ${r.ratio.toFixed(2).padStart(5)}:1  ${r.label}`)
}

const failed = results.filter((r) => !r.pass).length
console.log(`\n  ${results.length - failed}/${results.length} pairs pass AA · ${dangling.length} dangling refs · ${missing.length + missingDark.length} missing tokens\n`)

if (problems.length) {
  console.error("  NOT SHIPPABLE\n")
  for (const p of problems) console.error("  ✗ " + p)
  console.error("")
  process.exit(1)
}
console.log("  ✓ theme complete, legible, resolved\n")

function fail(msg) {
  console.error("  ✗ " + msg)
  process.exit(1)
}
