import type { Metadata } from "next"
import Link from "next/link"

import { AgentTrace } from "@/components/AgentTrace"
import { PrismTraceWidget } from "@/components/skills/PrismTraceWidget"
import { runSuggestLooks } from "@/lib/agent/skills/suggest-looks"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Pull — suggest looks",
  robots: { index: false, follow: false },
}

function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function formatStamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

/**
 * /suggest-looks — the researched suggest-looks skill, shown as a working demo.
 *
 * The brief for this surface: when the agent suggests looks, the stylist sees *why* — the client's
 * own record (red carpet, editorials, custom looks), the houses that record names, the Vogue Runway
 * collection each look came from, and the trace of the calls that produced it. Nothing here is
 * generated: the dataset is the record of a real research run, and the trace is that run.
 */
export default function SuggestLooksPage() {
  const run = runSuggestLooks()
  const associated = run.evidence.filter((brand) => brand.association === "client")
  const tangential = run.evidence.filter((brand) => brand.association === "tangential")
  const sinkConfigured = Boolean(
    process.env.PRISMTRACE_HOST && process.env.PRISMTRACE_PROJECT_ID && process.env.PRISMTRACE_API_KEY,
  )
  const looks = run.collections.reduce((sum, collection) => sum + collection.looks.length, 0)

  return (
    <main className="container" style={{ paddingTop: 48, paddingBottom: 96 }}>
      <p className="eyebrow">Skill · suggest looks</p>
      <h1 className="display" style={{ margin: "12px 0 0", fontSize: "clamp(34px, 5vw, 64px)" }}>
        Eight looks per house, from the record.
      </h1>
      <p className="small" style={{ maxWidth: 620, marginTop: 16, lineHeight: 1.6 }}>
        {run.brief} This surface is the skill working: the client&apos;s own record first, then the
        houses that record names, then eight looks from each house&apos;s Vogue Runway collection.
      </p>
      <p className="mono" style={{ marginTop: 14, fontSize: 10, letterSpacing: ".02em", color: "var(--muted-foreground-soft)" }}>
        client {run.client} · researched {formatStamp(run.researchedAt)} · {run.sources.length} sources ·{" "}
        {associated.length} associated houses · {run.collections.length} collections · {looks} looks
      </p>

      {/* 1 · the record — where the brand association comes from */}
      <section aria-label="Client record" style={{ marginTop: 48 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
          <h2 className="h3" style={{ margin: 0 }}>
            The record
          </h2>
          <span className="mono" style={{ fontSize: 10, color: "var(--muted-foreground-soft)" }}>
            red carpet · instagram · editorials · custom
          </span>
        </div>
        <p className="small" style={{ margin: "8px 0 18px", color: "var(--muted-foreground)" }}>
          Every house below is named by something the client wore — not by a mood. Source:{" "}
          <a href={run.sources[0]?.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
            {run.sources[0]?.label}
          </a>
          .
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {associated.map((brand) => (
            <article key={brand.brand} className="card" style={{ padding: 16 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{brand.brand}</h3>
                <span className="mono" style={{ fontSize: 10, color: "var(--brand)" }}>
                  associated
                </span>
              </div>
              <p className="small" style={{ margin: "6px 0 0", color: "var(--muted-foreground)" }}>
                {brand.note}
              </p>
              <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                {brand.moments.slice(0, 3).map((moment) => (
                  <li key={`${brand.brand}-${moment.date}`} className="mono" style={{ fontSize: 10, lineHeight: 1.5, color: "var(--muted-foreground-soft)" }}>
                    {formatDay(moment.date)} · {moment.occasion}
                    <br />
                    <span style={{ color: "var(--foreground)" }}>{moment.outfit}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* 2 · the runway — eight looks per collection, with provenance */}
      <section aria-label="Runway collections" style={{ marginTop: 56 }}>
        <h2 className="h3" style={{ margin: 0 }}>
          The runway
        </h2>
        <p className="small" style={{ margin: "8px 0 22px", color: "var(--muted-foreground)" }}>
          Eight looks from each collection. Every tile links back to the Vogue Runway collection it was
          pulled from — the record is the provenance.
        </p>
        {run.collections.map((collection) => (
          <div key={`${collection.brand}-${collection.season}`} style={{ marginBottom: 36 }}>
            <div
              className="row"
              style={{ justifyContent: "space-between", alignItems: "baseline", gap: 14, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                {collection.brand}
                <span className="mono" style={{ marginLeft: 10, fontSize: 10, fontWeight: 400, color: "var(--muted-foreground-soft)" }}>
                  {collection.season}
                </span>
                {collection.association === "tangential" && (
                  <span className="mono" style={{ marginLeft: 10, fontSize: 10, fontWeight: 400, color: "var(--brand)" }}>
                    same register
                  </span>
                )}
              </h3>
              <a
                href={collection.slideshowUrl}
                target="_blank"
                rel="noreferrer"
                className="mono"
                style={{ fontSize: 10, color: "var(--muted-foreground)", textDecoration: "underline" }}
              >
                Vogue Runway →
              </a>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 1, background: "var(--border)", marginTop: 12 }}>
              {collection.looks.map((look) => (
                <figure key={`${collection.brand}-${look.lookNo}`} style={{ margin: 0, background: "var(--background)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={look.image}
                    alt={`${collection.brand} ${collection.season} look ${look.lookNo}`}
                    width={640}
                    height={853}
                    loading="lazy"
                    style={{ display: "block", width: "100%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: 0 }}
                  />
                  <figcaption className="mono" style={{ padding: "6px 6px 8px", fontSize: 10, color: "var(--muted-foreground)" }}>
                    look {look.lookNo}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* 3 · what the agent did — trace first, then the PRISM mirror */}
      <section aria-label="Research trace" style={{ marginTop: 16 }}>
        <h2 className="h3" style={{ margin: "0 0 4px" }}>
          What the agent did
        </h2>
        <p className="small" style={{ margin: "0 0 18px", color: "var(--muted-foreground)" }}>
          Every call the skill made, with its arguments, result and duration. The Vogue Runway steps
          carry the real fetch time of the run that built this dataset.
        </p>
        <AgentTrace steps={run.trace} title="Suggest looks · research run" />
        <div style={{ marginTop: 20 }}>
          <PrismTraceWidget steps={run.trace} sinkConfigured={sinkConfigured} provider="zoowork" />
        </div>
      </section>

      {/* 4 · sources */}
      <section aria-label="Sources" style={{ marginTop: 48 }}>
        <h2 className="h3" style={{ margin: 0 }}>
          Sources
        </h2>
        <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
          {run.sources.map((source) => (
            <li key={source.url} className="small">
              <a href={source.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                {source.label}
              </a>
              <span className="mono" style={{ marginLeft: 10, fontSize: 10, color: "var(--muted-foreground-soft)" }}>
                {source.kind} · {source.note}
              </span>
            </li>
          ))}
        </ul>
        <p className="small" style={{ marginTop: 18, color: "var(--muted-foreground)" }}>
          Tile images and collection links belong to Vogue Runway; they are shown here as provenance for
          the suggestion, not as assets of this demo. See{" "}
          <Link href="/design" style={{ textDecoration: "underline" }}>
            the design canvas
          </Link>{" "}
          for the tokens this page uses.
        </p>
      </section>
    </main>
  )
}
