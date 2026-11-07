/**
 * The request email (PRD §17.2 deterministic template, FR-13 / FR-24).
 *
 * Deterministic by default: every approved look, the SHOOT DETAILS block, the ship-to address and the
 * shipping branch. An LLM is an optional *enhancer* — when a provider is configured the wording is
 * rewritten, but the draft is only accepted if every approved look number still appears, otherwise the
 * template ships. Nothing here sends anything; a human press does that.
 */
import { activeProvider, runAgentTask } from "./index"

export interface DraftLook {
  lookNo: number
  season: string | null
}

export interface DraftInput {
  job: {
    clientName: string
    title: string
    shootDate: string
    callInDate: string
    returnDate: string
  }
  brand: string
  looks: DraftLook[]
  contact: { emails: string[]; shipsOnOwnAccount: boolean } | null
  studioAddress: Record<string, string> | null
  intakeUrl?: string
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export function formatAddress(address: Record<string, string> | null): string {
  if (!address) return "(studio address not set — add it in the studio settings)"
  return ["name", "street1", "street2", "city", "state", "zip", "country"]
    .map((key) => address[key])
    .filter(Boolean)
    .join(", ")
}

export function deterministicDraft(input: DraftInput): { subject: string; body: string } {
  const { job, brand, looks, contact } = input
  const looksList = looks
    .slice()
    .sort((a, b) => a.lookNo - b.lookNo)
    .map((look) => `• Look ${look.lookNo}${look.season ? ` (${look.season})` : ""}`)
    .join("\n")

  const shipping = contact?.shipsOnOwnAccount
    ? "Please ship on your account — we do not need a label."
    : input.intakeUrl
      ? `If you would rather not ship on your own account, fill this in and we will send a prepaid label and a pickup: ${input.intakeUrl}`
      : "Please ship on your own account — the label is not needed."

  const subject = `Pull request — ${brand.toUpperCase()} · ${job.clientName} · ${looks.length} look${looks.length === 1 ? "" : "s"}`

  const body = `Hi ${brand} PR team,

I am pulling for ${job.clientName} on ${job.title}. Requesting:

${looksList}

SHOOT DETAILS
  Shoot date:    ${formatDate(job.shootDate)}
  Call-in date:  ${formatDate(job.callInDate)}
  Return date:   ${formatDate(job.returnDate)}
  Ship to:       ${formatAddress(input.studioAddress)}

${shipping}

Thank you,
Juje`

  return { subject, body }
}

/** True when every approved look number appears as "Look N" — the FR-24 acceptance check. */
export function includesEveryLook(body: string, looks: DraftLook[]): boolean {
  return looks.every((look) => new RegExp(`look\\s*${look.lookNo}\\b`, "i").test(body))
}

export async function draftRequestEmail(
  input: DraftInput,
  ctx?: { jobId: string },
): Promise<{ subject: string; body: string; provider: "deterministic" | "deepseek" | "zoowork" }> {
  const template = deterministicDraft(input)
  const provider = activeProvider()
  if (provider === "deterministic") return { ...template, provider }

  const system =
    "You rewrite fashion PR request emails. Keep every approved look number, the SHOOT DETAILS block (shoot, call-in, return, ship-to) and the shipping instruction. Concise, warm, professional, no exclamation marks. Never invent dates, addresses or looks. Return only the email body: no subject line, no markdown, no signature block."
  const user = `Rewrite this email for ${input.brand}:\n\n${template.body}`

  try {
    const result = await runAgentTask({ system, user, json: false }, { jobId: ctx?.jobId, kind: "request-email" })
    const polished = (result.text ?? "").trim()
    if (!polished || !includesEveryLook(polished, input.looks)) {
      // The rewrite lost a look — PRD FR-24: reject the draft and use the template.
      return { ...template, provider: "deterministic" }
    }
    return { subject: template.subject, body: polished, provider }
  } catch {
    return { ...template, provider: "deterministic" }
  }
}
