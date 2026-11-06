import Link from "next/link"

export default function LandingPage() {
  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Link className="wordmark" href="/">
            PULL
          </Link>
          <nav className="nav-links">
            <a href="#how">How it works</a>
            <a href="#client">Client view</a>
            <a href="#labels">Labels</a>
            <Link href="/trace">Agent trace</Link>
          </nav>
          <div className="nav-actions">
            <Link className="btn btn-primary btn-sm" href="/studio">
              Start a job
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="hero">
          <div className="container split grid">
            <div className="hero-copy">
              <span className="hero-badge">
                <span className="dot" />
                SAMPLE TRAFFICKING, AUTOMATED
              </span>
              <h1 className="display">
                From a folder of screenshots to a board your client <em>signs off.</em>
              </h1>
              <p className="lead">
                PULL crops every look, reads the look number and season out of the image, builds the boards,
                and sends your client one link. Their approvals come back as <strong>requests</strong> — with
                the shoot details already filled in.
              </p>
              <div className="hero-actions">
                <Link className="btn btn-primary" href="/studio">
                  Start a job
                </Link>
                <a className="btn btn-ghost" href="/preview/client.html">
                  See the client view
                </a>
              </div>
              <p className="hero-note">REAL LABELS VIA SHIPPO · REAL EMAIL VIA RESEND · NO LOGINS FOR YOUR CLIENT</p>
            </div>

            <div className="shot" aria-label="PULL board preview">
              <div className="shot-bar">
                <span className="shot-title">PULL / BOARD</span>
                <span className="mono" style={{ color: "var(--dark-muted)" }}>
                  CELINE · AW26
                </span>
              </div>
              <div className="shot-body">
                <div className="mini-meta">
                  <span className="mini-brand">CELINE</span>
                  <span className="mini-count">4 LOOKS OF 71 · 2 CONFIRMED</span>
                </div>
                <div className="mini-board">
                  {[
                    ["look-27", 27, true],
                    ["look-31", 31, true],
                    ["look-14", 14, false],
                    ["look-04", 4, false],
                    ["look-06", 6, false],
                    ["look-09", 9, false],
                  ].map(([file, no, confirmed]) => (
                    <div key={String(file)} className={`mini-look ${confirmed ? "confirmed" : ""}`}>
                      {confirmed ? <span className="flag" /> : null}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/looks/${file}.jpg`} alt={`Look ${no}`} />
                      <span className="num">LOOK {no}</span>
                    </div>
                  ))}
                </div>
                <div className="row" style={{ justifyContent: "space-between", marginTop: 14 }}>
                  <span className="mono" style={{ color: "var(--dark-muted)", fontSize: 10 }}>
                    AGENT: 10 CROPPED · 9 READ FROM IMAGE
                  </span>
                  <span className="btn btn-on-dark btn-sm" style={{ height: 32 }}>
                    Publish link
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="section tight no-rule">
          <div className="container">
            <div className="stats">
              <div className="stat">
                <div className="n">
                  62<span style={{ fontSize: "0.5em" }}>%</span>
                </div>
                <div className="l">of each screenshot removed — chrome, margins, captions</div>
              </div>
              <div className="stat">
                <div className="n">
                  3<span style={{ fontSize: "0.5em" }}> min</span>
                </div>
                <div className="l">from folder to a published client board</div>
              </div>
              <div className="stat">
                <div className="n">0</div>
                <div className="l">logins for your client — one signed link</div>
              </div>
              <div className="stat">
                <div className="n">1</div>
                <div className="l">pre-filled request per house, with call-in and return dates</div>
              </div>
            </div>
          </div>
        </section>

        {/* HOW */}
        <section className="section" id="how">
          <div className="container">
            <p className="eyebrow" style={{ marginBottom: 18 }}>
              THREE ACTS
            </p>
            <h2 className="h2" style={{ maxWidth: 760 }}>
              The board, the approval, the label. Nothing else to manage.
            </h2>
            <div className="grid three" style={{ marginTop: "clamp(32px,4vw,56px)" }}>
              <article className="step">
                <span className="n">01 — BOARD</span>
                <h3 className="h3">Drop the screenshots.</h3>
                <p>
                  The agent crops each one down to the look, reads the look number and season from the image
                  itself, and groups everything by house. You edit anything it guessed wrong. Then publish.
                </p>
              </article>
              <article className="step">
                <span className="n">02 — APPROVE</span>
                <h3 className="h3">One link, no login.</h3>
                <p>
                  Your client swipes, stars the priorities and leaves notes on their phone. You get a
                  report — counts, shortlist, every comment attached to its look — instead of a thread.
                </p>
              </article>
              <article className="step">
                <span className="n">03 — REQUEST</span>
                <h3 className="h3">Requests and labels.</h3>
                <p>
                  One draft per house with the shoot details already in it. Approve and send. If a showroom
                  can’t ship, it gets a link for box and pickup details, and you buy the label in Shippo.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* CLIENT VIEW */}
        <section className="section" id="client">
          <div className="container split grid">
            <div className="stack">
              <p className="eyebrow">THE CLIENT VIEW</p>
              <h2 className="h2">They swipe. You get a report.</h2>
              <p className="lead">
                Your client’s board is dark, quiet and full-bleed — the restraint of a look book. Approve,
                pass, star a priority, leave a note. Nothing reaches you until they preview the set and send.
              </p>
              <ul className="stack" style={{ gap: 10, margin: "6px 0 0", padding: 0, listStyle: "none" }}>
                <li className="small">— Approvals and comments arrive as structured data, not a PDF reply</li>
                <li className="small">— Priorities are ranked, so the requests lead with the must-haves</li>
                <li className="small">— Works on a phone at 375 px, in one hand</li>
              </ul>
              <div className="row" style={{ marginTop: 8 }}>
                <a className="btn btn-primary" href="/preview/client.html">
                  Open the client view
                </a>
              </div>
            </div>

            <div className="shot">
              <div className="shot-bar">
                <span className="shot-title">FOR TIMOTHÉE CHALAMET</span>
                <span className="mono" style={{ color: "var(--dark-muted)" }}>
                  3 / 9
                </span>
              </div>
              <div className="shot-body">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="look selected">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/looks/look-27.jpg" alt="Look 27" style={{ borderRadius: 8 }} />
                    <div style={{ padding: "8px 0 0", display: "flex", justifyContent: "space-between" }}>
                      <span className="mono" style={{ color: "var(--dark-muted)", fontSize: 9 }}>
                        LOOK 27 · AW26
                      </span>
                      <span className="mono" style={{ color: "var(--dark-ok)", fontSize: 9 }}>
                        APPROVED
                      </span>
                    </div>
                  </div>
                  <div className="look">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/looks/look-31.jpg" alt="Look 31" style={{ borderRadius: 8 }} />
                    <div style={{ padding: "8px 0 0", display: "flex", justifyContent: "space-between" }}>
                      <span className="mono" style={{ color: "var(--dark-muted)", fontSize: 9 }}>
                        LOOK 31 · AW26
                      </span>
                      <span className="mono" style={{ color: "var(--dark-muted)", fontSize: 9 }}>
                        UNDECIDED
                      </span>
                    </div>
                  </div>
                </div>
                <div className="row" style={{ gap: 8, marginTop: 14 }}>
                  <span className="star on">★</span>
                  <span className="star on">★</span>
                  <span className="star">★</span>
                  <span className="mono" style={{ color: "var(--dark-muted)", fontSize: 10, marginLeft: 6 }}>
                    PRIORITY
                  </span>
                </div>
                <div className="note">
                  <input value="Love this — keep the shoulders sharp." readOnly aria-label="Note" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* LABELS */}
        <section className="section" id="labels">
          <div className="container split grid">
            <div className="card" aria-label="Showroom intake preview">
              <p className="eyebrow">PULL · LABEL REQUEST</p>
              <h3 className="h3" style={{ margin: "10px 0 4px" }}>
                CELINE — 2 looks
              </h3>
              <p className="small">Box and pickup details so we can send a prepaid label.</p>
              <div className="field-grid" style={{ marginTop: 16 }}>
                <div className="field">
                  <label>Length (cm)</label>
                  <input value="40" readOnly />
                </div>
                <div className="field">
                  <label>Width (cm)</label>
                  <input value="30" readOnly />
                </div>
                <div className="field">
                  <label>Height (cm)</label>
                  <input value="12" readOnly />
                </div>
              </div>
              <div style={{ marginTop: 12 }} className="rate-option" aria-checked="true">
                <div className="rate-main">
                  <div className="rate-name">FedEx Express</div>
                  <div className="rate-meta">2 DAYS · PICKUP TODAY</div>
                </div>
                <div className="rate-price">$109.03</div>
              </div>
              <div className="rate-option" aria-checked="false">
                <div className="rate-main">
                  <div className="rate-name">UPS Ground</div>
                  <div className="rate-meta">4 DAYS · PICKUP TOMORROW</div>
                </div>
                <div className="rate-price">$62.40</div>
              </div>
            </div>

            <div className="stack">
              <p className="eyebrow">LABELS AND TRACKING</p>
              <h2 className="h2">A prepaid label, without the email tennis.</h2>
              <p className="lead">
                The agent looks up the showroom in your contacts. If they ship on their own account, the
                request says so. If they need a label, they get a link — box, weight, pickup — and Shippo
                returns the rates. You pick one, the label attaches to the same thread, and the tracking
                number shows on the request.
              </p>
              <ul className="stack" style={{ gap: 10, margin: "6px 0 0", padding: 0, listStyle: "none" }}>
                <li className="small">— Rates, transit days and cost from Shippo, per parcel</li>
                <li className="small">— Label PDF attached to the thread; tracking mirrored on screen</li>
                <li className="small">— Every call visible in the agent trace, retryable when it fails</li>
              </ul>
              <div className="row" style={{ marginTop: 8 }}>
                <a className="btn btn-ghost" href="/preview/showroom.html">
                  Open the showroom view
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* TRACE STRIP */}
        <section className="section">
          <div className="container split grid">
            <div className="stack">
              <p className="eyebrow">THE AGENT, IN THE OPEN</p>
              <h2 className="h2">No black box.</h2>
              <p className="lead">
                Every tool call — the Cloudinary trim, the OCR read, the parse, the Shippo rate, the Resend
                send — is shown with its input, output, duration and status. Failed steps stay in the trace
                with the provider’s own message.
              </p>
              <div className="row" style={{ marginTop: 8 }}>
                <Link className="btn btn-primary" href="/trace">
                  See a trace
                </Link>
              </div>
            </div>
            <div className="card">
              <p className="eyebrow">LIVE TRACE · IMPORT</p>
              <ol className="trace" style={{ marginTop: 16 }}>
                {[
                  ["cloudinary.upload", "812 ms", "ok"],
                  ["cloudinary.trim", "306 ms", "removed 62%"],
                  ["tesseract.read", "1.6 s", "“Look 27 — AW26” · 92%"],
                  ["parse.look", "3 ms", "lookNo 27 · AW26 · CELINE"],
                  ["db.group_boards", "41 ms", "5 boards · 10 looks"],
                ].map(([tool, time, note]) => (
                  <li key={tool} className="trace-step">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="trace-tool">{tool}</span>
                      <span className="trace-meta">{time}</span>
                    </div>
                    <p className="small" style={{ marginTop: 2, fontSize: 12 }}>
                      {note}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* QUOTE */}
        <section className="section">
          <div className="container">
            <div className="quote">
              <blockquote>
                “The board the client approves is the same record the request is built from. Nothing gets
                retyped — not the looks, not the dates, not the address.”
              </blockquote>
              <cite>Juje · stylist, New York</cite>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="section no-rule" style={{ paddingBottom: "clamp(56px,7vw,96px)" }}>
          <div className="container">
            <div className="cta">
              <div className="stack">
                <h2 className="h2">Supercharge your pull.</h2>
                <p className="lead">Drop the screenshots. PULL does the cropping, the boards and the chasing.</p>
              </div>
              <div className="row">
                <Link className="btn btn-on-dark" href="/studio">
                  Start a job
                </Link>
                <Link className="btn btn-on-dark-ghost" href="/trace">
                  Agent trace
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <Link className="wordmark" href="/">
                PULL
              </Link>
              <p className="small" style={{ marginTop: 12, maxWidth: 280 }}>
                Sample trafficking for stylists. Demo build on Vercel, Neon, Cloudinary, Resend and Shippo.
              </p>
            </div>
            <div>
              <p className="eyebrow">PRODUCT</p>
              <a href="/preview/client.html">Client board</a>
              <a href="/preview/showroom.html">Showroom intake</a>
              <a href="#labels">Labels</a>
            </div>
            <div>
              <p className="eyebrow">BUILD</p>
              <Link href="/setup">Stack setup</Link>
              <Link href="/trace">Agent trace</Link>
              <a href="/preview/index.html">Static preview</a>
            </div>
            <div>
              <p className="eyebrow">STYLIST</p>
              <Link href="/studio">Start a job</Link>
              <a href="/preview/showroom.html">Send an intake link</a>
            </div>
          </div>
          <div className="fine">
            <span className="small">© 2026 PULL</span>
            <span className="small">Design reference: Augment (Framer) · type: Inter / JetBrains Mono</span>
          </div>
        </div>
      </footer>
    </>
  )
}
