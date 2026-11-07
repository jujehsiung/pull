/**
 * /design — the living canvas for the Pull design system.
 *
 * This page exists to answer one question a token file cannot: does the theme
 * actually reach the primitives? Every swatch reads a live token and every
 * control below is a real EVA/shadcn primitive styled only by Tailwind
 * utilities that resolve through src/styles/pull-theme.css. If the mapping
 * were broken, this page would render in Dark EVA's purple and black.
 *
 * It is also the review surface: designers see the palette, type scale and
 * controls in one place, at both modes, without running Storybook.
 *
 * Delete this route before shipping if you do not want it public.
 */

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const SURFACES = [
  ["--background", "paper", "the page"],
  ["--card", "card", "raised, white"],
  ["--muted", "muted", "a surface — never text"],
  ["--accent", "accent", "selection surface"],
]
const TEXT = [
  ["--foreground", "focus the eye", "18.79:1"],
  ["--muted-foreground", "body secondary", "5.14:1"],
  ["--muted-foreground-soft", "eyebrow / meta", "5.01:1"],
  ["--brand", "olive emphasis", "7.40:1"],
]
const FEEDBACK = [
  ["--success", "success"],
  ["--warning", "warning"],
  ["--destructive", "destructive"],
  ["--info", "info"],
]
const LOOKBOOK = [
  ["--dark", "page"],
  ["--dark-2", "card"],
  ["--dark-3", "raised"],
  ["--dark-line", "rule"],
  ["--dark-text", "text"],
  ["--dark-muted", "muted"],
  ["--dark-ok", "confirmed"],
]
const RADII = [
  ["rounded-sm", "8.4px · chips"],
  ["rounded-md", "11.2px · inputs"],
  ["rounded-lg", "14px · the card radius"],
  ["rounded-xl", "19.6px · dialogs"],
  ["rounded-full", "pill · house buttons"],
]

function Swatch({ token, label, note }: { token: string; label: string; note?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-16 w-full rounded-lg border border-border"
        style={{ background: `var(${token})` }}
      />
      <div className="flex flex-col gap-0.5">
        <code className="font-mono text-[11px] text-foreground">{token}</code>
        <span className="text-[11px] text-muted-foreground">
          {label}
          {note ? ` · ${note}` : ""}
        </span>
      </div>
    </div>
  )
}

function Section({
  eyebrow,
  title,
  children,
  tone = "light",
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
  tone?: "light" | "dark"
}) {
  return (
    <section
      /* EVA's dark block selects on the COMPOUND [data-eva-theme][data-mode],
         so a nested dark region restates both rather than inheriting one. */
      data-eva-theme={tone === "dark" ? "pull" : undefined}
      data-mode={tone === "dark" ? "dark" : undefined}
      className={
        tone === "dark"
          ? "rounded-xl bg-background p-8 text-foreground"
          : "border-t border-border pt-10"
      }
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-medium tracking-[-0.02em] text-foreground">{title}</h2>
      <div className="mt-7">{children}</div>
    </section>
  )
}

export default function DesignPage() {
  return (
    <main className="mx-auto max-w-[1180px] px-6 py-14">
      {/* ── masthead ─────────────────────────────────────────────────────── */}
      <header className="pb-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground-soft">
          PULL · DESIGN SYSTEM
        </p>
        <h1 className="mt-4 text-5xl font-medium leading-[1.02] tracking-[-0.035em] text-foreground">
          EVA tokens, <span className="text-muted-foreground-soft">Pull values</span>
        </h1>
        <p className="mt-5 max-w-[620px] text-[17px] leading-relaxed text-muted-foreground">
          The contract is <code className="font-mono text-[13px] text-brand">src/styles/pull-theme.css</code>{" "}
          on the kit&apos;s shadcn vocabulary. Every colour below is a live token, and every control is a
          real primitive — no bespoke CSS in this page beyond layout.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Badge>50 tokens</Badge>
          <Badge variant="secondary">33 AA pairs</Badge>
          <Badge variant="outline">shadcn · Radix</Badge>
          <code className="ml-1 font-mono text-[11px] text-muted-foreground">
            npm run tokens:check
          </code>
        </div>
      </header>

      <div className="mt-10 flex flex-col gap-12">
        {/* ── colour ─────────────────────────────────────────────────────── */}
        <Section eyebrow="01 — surface" title="The page, the card, the selection">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            {SURFACES.map(([t, l, n]) => (
              <Swatch key={t} token={t} label={l} note={n} />
            ))}
          </div>
          <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-4">
            {TEXT.map(([t, l, n]) => (
              <Swatch key={t} token={t} label={l} note={n} />
            ))}
          </div>
        </Section>

        {/* ── feedback ───────────────────────────────────────────────────── */}
        <Section eyebrow="02 — status" title="Feedback never becomes an action">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            {FEEDBACK.map(([t, l]) => (
              <Swatch key={t} token={t} label={l} />
            ))}
          </div>
        </Section>

        {/* ── type ───────────────────────────────────────────────────────── */}
        <Section eyebrow="03 — type" title="One scale, generous leading">
          <div className="flex flex-col gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground-soft">
                display · 76 / 1.02 / -0.035em
              </p>
              <p className="mt-2 text-[clamp(40px,6vw,76px)] font-medium leading-[1.02] tracking-[-0.035em] text-foreground">
                Signed off
              </p>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground-soft">
                h2 · 44 / 1.08
              </p>
              <p className="mt-2 text-[clamp(28px,3.6vw,44px)] font-medium leading-[1.08] tracking-[-0.03em] text-foreground">
                From screenshots to a board
              </p>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground-soft">
                lead · 19 / 1.55
              </p>
              <p className="mt-2 max-w-[640px] text-[19px] leading-[1.55] text-muted-foreground">
                Drop a folder of look screenshots. PULL crops them, reads the look numbers, builds the
                boards, and sends your client one link.
              </p>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground-soft">
                eyebrow · 11 mono / 0.16em uppercase
              </p>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                FR-4 · READ FROM IMAGE · CONFIDENCE 0.94
              </p>
            </div>
          </div>
        </Section>

        {/* ── buttons ────────────────────────────────────────────────────── */}
        <Section eyebrow="04 — action" title="Ink is the primary action">
          <div className="flex flex-col gap-7">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Publish board</Button>
              <Button variant="outline">Copy link</Button>
              <Button variant="secondary">Review</Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="destructive">Delete look</Button>
              <Button variant="link">Open trace</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="xs">xs</Button>
              <Button size="sm">sm</Button>
              <Button size="default">default</Button>
              <Button size="lg">lg — build boards</Button>
              <Button size="icon" aria-label="Add">
                +
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>READY</Badge>
              <Badge variant="secondary">READING CAPTION</Badge>
              <Badge variant="outline">UNASSIGNED</Badge>
              <Badge variant="destructive">CONTACT MISSING</Badge>
              <Badge variant="ghost">hidden</Badge>
            </div>
          </div>
        </Section>

        {/* ── forms ──────────────────────────────────────────────────────── */}
        <Section eyebrow="05 — forms" title="Five fields, one rule validated live">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="job-name">Job name</Label>
              <Input id="job-name" placeholder="Oscar campaign" defaultValue="Oscar campaign" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="client">Client</Label>
              <Input id="client" placeholder="Timothée Chalamet" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="calling">Call-in date</Label>
              <Input id="calling" type="date" defaultValue="2026-11-06" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="purchase">Allow label purchase</Label>
                <span className="text-[12px] text-muted-foreground">
                  Off by default — buying spends real money
                </span>
              </div>
              <Switch id="purchase" />
            </div>
          </div>
        </Section>

        {/* ── surfaces + tabs ────────────────────────────────────────────── */}
        <Section eyebrow="06 — containers" title="Cards hold content, not other cards">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Oscar campaign</CardTitle>
                <CardDescription>10 looks · 5 brands · call-in today</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Looks ready</span>
                  <span className="font-mono text-foreground">10</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Approved by client</span>
                  <span className="font-mono text-brand">7</span>
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button size="sm">Publish</Button>
                <Button size="sm" variant="outline">
                  Preview
                </Button>
              </CardFooter>
            </Card>

            <Tabs defaultValue="trace">
              <TabsList>
                <TabsTrigger value="trace">Agent trace</TabsTrigger>
                <TabsTrigger value="report">Report</TabsTrigger>
              </TabsList>
              <TabsContent value="trace" className="flex flex-col gap-3 pt-4">
                <Alert>
                  <AlertTitle>Every step is traced</AlertTitle>
                  <AlertDescription>
                    10 × cloudinary.upload, 10 × tesseract.read, 1 × agent.group — with the provider&apos;s
                    own message when a step fails.
                  </AlertDescription>
                </Alert>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </TabsContent>
              <TabsContent value="report" className="pt-4">
                <p className="text-sm text-muted-foreground">
                  Counts, the priority shortlist, and every note attached to its look.
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </Section>

        {/* ── radius ─────────────────────────────────────────────────────── */}
        <Section eyebrow="07 — shape" title="One radius, derived">
          <div className="flex flex-wrap gap-5">
            {RADII.map(([cls, note]) => (
              <div key={cls} className="flex flex-col items-center gap-2">
                <div className={`size-20 border border-border bg-muted ${cls}`} />
                <code className="font-mono text-[11px] text-foreground">{cls}</code>
                <span className="text-[11px] text-muted-foreground">{note}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── the lookbook material ──────────────────────────────────────── */}
        <Section eyebrow="08 — lookbook" title="The dark board a client opens from a link">
          <p className="mb-6 max-w-[640px] text-sm text-muted-foreground">
            Not dark mode. This material is fixed and stays dark inside a light page, which is why it
            lives on its own tokens (<code className="font-mono text-[12px]">--dark*</code>) rather than
            flipping with a mode switch.
          </p>
          <div className="grid grid-cols-2 gap-4 rounded-xl bg-[var(--dark)] p-6 sm:grid-cols-4">
            {LOOKBOOK.map(([t, l]) => (
              <div key={t} className="flex flex-col gap-2">
                <div
                  className="h-14 w-full rounded-lg border border-[var(--dark-line)]"
                  style={{ background: `var(${t})` }}
                />
                <code className="font-mono text-[10px] text-[var(--dark-text)]">{t}</code>
                <span className="text-[10px] text-[var(--dark-muted)]">{l}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3 rounded-xl bg-[var(--dark)] p-6">
            <button className="rounded-full bg-[var(--dark-text)] px-5 py-2 text-[13px] font-medium text-[var(--dark)]">
              Approve all
            </button>
            <button className="rounded-full border border-[var(--dark-line)] px-5 py-2 text-[13px] text-[var(--dark-text)]">
              Pass
            </button>
            <span className="rounded-full border border-[var(--dark-ok)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--dark-ok)]">
              7 approved
            </span>
          </div>
        </Section>

        {/* ── dark mode, completeness proof ──────────────────────────────── */}
        <Section eyebrow="09 — dark set" title="The unused half of the contract" tone="dark">
          <p className="max-w-[620px] text-sm text-muted-foreground">
            The app ships light only. This block is the theme&apos;s dark set, rendered by setting{" "}
            <code className="font-mono text-[12px] text-brand">data-mode=&quot;dark&quot;</code> on the
            wrapper. It exists because an incomplete theme silently falls back to Dark EVA&apos;s palette
            one token at a time.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
            {SURFACES.map(([t, l]) => (
              <Swatch key={t} token={t} label={l} />
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Badge>badge</Badge>
            <Badge variant="outline">outline</Badge>
          </div>
        </Section>
      </div>

      <footer className="mt-16 border-t border-border pt-8 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground-soft">
        PULL · EVA theme · {new Date().getFullYear()} · tokens checked by scripts/check-tokens.mjs
      </footer>
    </main>
  )
}
