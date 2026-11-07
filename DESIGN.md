# DESIGN.md — PULL's design contract

PULL wears the **EVA** design system (`@muen/eva`) with its own values. EVA supplies the token
vocabulary and the shadcn/Radix primitives; Pull supplies the palette. This file is the contract
between design and code — if it and the code disagree, that is a defect, not a backlog item.

> **The rule that matters most:** components never carry a hex. They reference a token. The token
> values below are the only place a colour is written down.

---

## 1. Where things live

| File | What it is |
|---|---|
| `src/styles/pull-theme.css` | **The theme.** Every value, both modes. This is the file to edit. |
| `src/styles/eva/theme.css` | **Vendored EVA base** — the `@theme inline` mapping + Tailwind state variants. Values-free, byte-identical to upstream `@muen/eva` v0.6.0. Never put Pull colours here. |
| `src/styles/pull-bridge.css` | **Deprecated alias layer.** ~180 old references (`--paper`, `--ink`, `--mono`…) resolve here. Retire it line by line. |
| `src/app/globals.css` | The app's own sheets; imports the three above in order. |
| `src/components/ui/` | EVA's 29 primitives, copied in (the shadcn model). Yours to edit. |
| `src/lib/utils.ts` | `cn()` — the primitives' relative import resolves here. |
| `src/app/design/` | **The living canvas.** `/design` renders the palette, type scale and every primitive at both modes. |
| `components.json` | shadcn CLI config, pointed at `src/app/globals.css`. |
| `scripts/check-tokens.mjs` | **The gate.** Completeness, WCAG AA, dangling refs. |

**Import order is load-bearing.** `eva/theme.css` declares Dark EVA (Unit-01) in `:root`; Pull's
block wins only because it comes after and matches the same element. Do not reorder.

---

## 2. Naming: what each token means

The vocabulary is shadcn's, so primitives written for shadcn work unchanged. Two names are the ones
people get wrong:

| Token | Means | Does **not** mean |
|---|---|---|
| `--muted` | a **surface** (pale grey background) | text |
| `--muted-foreground` | **text** on that surface | a surface |
| `--accent` | the **selection surface** (a chosen row, hover) | the brand colour |
| `--brand` | the brand colour — Pull's olive | a fill for buttons |
| `--primary` | the **primary action fill** — ink | the brand colour |
| `--tertiary` | error/destructive status | a third brand colour |

**Pull's primary action is ink, not olive.** The olive is emphasis only: step numbers, the selected
rate card, the focus ring. A screen with several olive fills has lost the hierarchy.

---

## 3. The palette

### Light — the studio (default)

| Token | Value | Contrast | Role |
|---|---|---|---|
| `--background` | `#f9f9f8` | — | paper |
| `--foreground` | `#0a0a0a` | 18.79:1 | ink |
| `--card` | `#ffffff` | — | raised surface |
| `--muted` | `#f2f2f1` | — | inset surface |
| `--muted-foreground` | `#6b6a66` | 5.14:1 | body secondary |
| `--muted-foreground-soft` | `#706b64` | 5.01:1 | eyebrow / meta |
| `--border` | `#e6e3e3` | 1.21:1 | hairline rule |
| `--input` | `#d5d2cd` | 1.43:1 | field boundary — see §6 |
| `--ring` | `#465907` | 7.40:1 | focus ring |
| `--brand` | `#465907` | 7.40:1 | olive emphasis |
| `--accent` | `#eceee2` | — | selection surface |
| `--accent-foreground` | `#2c2c2b` | 11.91:1 | ink on selection |
| `--primary` / `--primary-foreground` | `#0a0a0a` / `#f9f9f8` | 18.79:1 | ink action |
| `--secondary` | `#f2f2f1` | — | neutral button |
| `--tertiary` / `--tertiary-text` | `#b3261e` | 6.20:1 | destructive |
| `--success` | `#2f6b3a` | 6.07:1 | shipped / confirmed |
| `--warning` | `#8a5a00` | 5.63:1 | needs attention |
| `--info` | `#1f5fa8` | 6.11:1 | neutral notice |
| `--radius` | `0` | — | square; every `rounded-*` utility derives to 0 |

### The lookbook material — fixed, not a mode

`--dark`, `--dark-2`, `--dark-3`, `--dark-line`, `--dark-text`, `--dark-muted`, `--dark-ok`.

The client board is a dark lookbook that clients open from a link, and it stays dark **inside a light
page** (the landing page shows one framed as a "screenshot"). It is therefore not dark mode and does
not flip with `data-mode`. It is declared once in the theme and never re-declared in the dark block.

| Token | Value | Contrast |
|---|---|---|
| `--dark` | `#0b0b0c` | — |
| `--dark-2` | `#121214` | — |
| `--dark-line` | `#26262a` | — |
| `--dark-text` | `#f4f4f2` | 17.86:1 |
| `--dark-muted` | `#8f8f95` | 6.12:1 |
| `--dark-ok` | `#8fd98f` | 11.70:1 |

### Dark — unused today, complete by contract

Set `data-eva-theme="pull" data-mode="dark"` **on the same element** (EVA selects on the compound, so
a nested dark region restates both attributes). The app ships light only; the block exists because an
incomplete theme silently falls back to Dark EVA one token at a time, and nothing errors.

---

## 4. Resolved inconsistencies

These were real conflicts, decided once. Do not re-litigate them in a component.

**`--muted` and `--accent` collided with the kit.** Pull's raw palette used `--muted` for a *text*
colour and `--accent` for the *olive brand*. Both are reserved names in shadcn, so a shadcn checkbox
or hover state would silently render with the wrong job. Migrated at the call sites:

| Was | Now | Sites |
|---|---|---|
| `var(--accent)` (olive) | `var(--brand)` | 12 |
| `var(--accent-soft)` | `var(--accent)` | 6 |
| `var(--muted)` (text) | `var(--muted-foreground)` | 32 |
| `var(--muted-2)` (text) | `var(--muted-foreground-soft)` | 37 |

Everything else is aliased in `pull-bridge.css` and costs nothing.

**`--muted-2` failed WCAG AA.** It was `#8f8b85` — **3.22:1** on paper, at 11px, on 37 sites
(eyebrows, meta, fine print). Raised to `#706b64` (**5.01:1**). Consequence: the two grey tiers now
sit close in weight, so that hierarchy is carried by **size, weight and tracking** (11px mono,
uppercase, 0.16em) rather than by value. Do not darken `--muted-foreground` to widen the gap; it is
already at 5.14:1 and the page's calm depends on it.

**Radius is zero (2026-11-06).** The visual references — vende.framer.media and Dover Street Market —
carry no rounding at all: square thumbnails, square buttons. Because the kit derives every `rounded-*`
utility from `--radius`, zeroing that one token squares the whole component set at once. Pull's older
sheets still draw their own corners from `--r-sm/--r-md/--r-lg`, so they are unchanged until they are
converted.

**The gutter is a blur filter (2026-11-06).** On the landing, the look band is full-bleed and its two
outer gutters are frosted glass — `backdrop-filter: blur(18px)` on a band whose width tracks the
content gutter (`clamp(24px, 2.8vw, 40px)`; **40px at 1440**, the same inset the H1 and hairline rules
start at), masked to nothing at the inner edge so the filter has no seam. A look leaves the frame out
of focus instead of on a hard vertical cut. This is a *treatment*, not a colour: it writes no hex and
adds no token, so it does not widen the theme surface.

---

## 5. Using the primitives

```tsx
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

<Button>Publish board</Button>          // ink — the primary action
<Button variant="outline">Copy link</Button>
<Badge variant="destructive">contact missing</Badge>
```

- **EVA first.** The kit's props (`variant`, `size`, `spacing`, `orientation`) express intent.
  Reach for a class only for layout.
- **Semantic utilities only:** `bg-background`, `text-foreground`, `text-muted-foreground`,
  `text-brand`, `border-border`, `ring-ring`, `font-mono`. A raw hex or `bg-[#f9f9f8]` fails review.
- **Red is status, never an action.** Delete, fail, blocked — `destructive`. The primary action is ink.
- **Add a component rather than butcher one.** If a screen needs a variant the kit lacks, add the
  variant (and register it here) instead of overriding its classes at the call site.

---

## 6. Open item — form boundaries

`--input` (`#d5d2cd`) is **1.43:1** against paper. WCAG 1.4.11 wants 3:1 for the boundary of a form
control. This is inherited from the reference design, whose whole character is hairline rules, and the
focus ring does carry 7.40:1. Two honest options:

1. **Accept it, documented** — inputs are identifiable by shape and focus state; the hairline look
   survives. This is what the reference does.
2. **Raise `--input` to ≈`#8a857e`** (3.0:1) — compliant, but every field gains a visibly darker edge.

Not decided. If a field ever becomes the only way to identify a control, this must change.

---

## 7. Checking it

```sh
npm run tokens:check      # completeness · 33 AA pairs · dangling refs
npx tsc --noEmit          # primitives typecheck
```

`tokens:check` reads the required-token list **out of** `src/styles/eva/theme.css`, so it tracks the
kit instead of drifting from it. A new token the kit consumes but the theme omits fails the gate. A
value that fails AA fails the gate. A typo'd `var(--tokn)` fails the gate.

Visual review: `/design` (the living canvas — both modes, every primitive).
