import Link from "next/link"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { LoginForm } from "@/components/LoginForm"

export const metadata = { title: "PULL — sign in" }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getSession()
  if (session) redirect("/studio")
  const { error } = await searchParams

  return (
    <main className="container" style={{ paddingTop: "clamp(48px, 8vw, 96px)", paddingBottom: 96 }}>
      <header className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <Link href="/" className="wordmark">
          PULL
        </Link>
        <span className="mono" style={{ color: "var(--muted-foreground-soft)" }}>
          STUDIO
        </span>
      </header>

      <div style={{ maxWidth: 620, marginTop: "clamp(40px, 6vw, 72px)" }}>
        <p className="eyebrow">SIGN IN</p>
        <h1 className="display" style={{ margin: "14px 0 0" }}>
          The studio is <em>one link away</em>.
        </h1>
        <p className="lead" style={{ marginTop: 18, maxWidth: 520 }}>
          No password. We email you a link that opens the studio for fifteen minutes.
        </p>

        {error === "expired" && (
          <p className="small" role="alert" style={{ marginTop: 20, color: "var(--danger)" }}>
            That link expired or was already used. Request a fresh one.
          </p>
        )}

        <LoginForm />
      </div>
    </main>
  )
}
