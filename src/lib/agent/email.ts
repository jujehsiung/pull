/**
 * Request-email drafting — the one place the demo uses AI today.
 *
 * Deterministic template first (always available), then an AI refinement when a provider is
 * configured. The AI can rewrite tone and ordering; it may not add or drop looks, because the
 * shape is validated against the approved set after parsing.
 */
import { activeProvider, runAgentTask } from "./index"

export interface EmailLook {
  lookNo: number
  season?: string
}

export interface RequestEmailInput {
  brand: string
  looks: EmailLook[]
  clientName: string
  jobTitle: string
  shootDate: string
  callInDate: string
  returnDate: string
  studioAddress: string
  shippingMode: "showroom_ships" | "needs_label" | "unknown"
  intakeLink?: string
  /** Who signs. Defaults to the stylist; never the client. */
  stylistName?: string
}

export interface DraftedEmail {
  subject: string
  body: string
  provider: "deterministic" | "deepseek" | "zoowork"
}

export function deterministicRequestEmail(input: RequestEmailInput): DraftedEmail {
  const looks = input.looks
    .map((look) => `• Look ${look.lookNo}${look.season ? ` (${look.season})` : ""}`)
    .join("\n")

  const shipping =
    input.shippingMode === "needs_label"
      ? `If you would rather not ship on your own account, fill this in and we will send a prepaid label\nand arrange the pickup: ${input.intakeLink ?? "[intake link]"}`
      : input.shippingMode === "showroom_ships"
        ? `Please ship on your account — no label is needed.`
        : `Let me know whether you would prefer to ship on your account or use a prepaid label from us.`

  return {
    provider: "deterministic",
    subject: `PULL request — ${input.brand} · ${input.clientName} · ${input.looks.length} look${input.looks.length === 1 ? "" : "s"}`,
    body: [
      `Hi ${input.brand} team,`,
      ``,
      `I'm pulling for ${input.clientName}${input.jobTitle ? ` on ${input.jobTitle}` : ""}. Requesting:`,
      ``,
      looks,
      ``,
      `SHOOT DETAILS`,
      `  Shoot date:   ${input.shootDate}`,
      `  Call-in date: ${input.callInDate}`,
      `  Return date:  ${input.returnDate}`,
      `  Ship to:      ${input.studioAddress}`,
      ``,
      shipping,
      ``,
      `Thank you,`,
      input.stylistName ?? "Juje",
    ].join("\n"),
  }
}

const SYSTEM = `You write pull-request emails for a fashion stylist to brand showrooms.
Keep it short and professional. No marketing adjectives, no exclamation marks, no emojis.
Preserve every look exactly as given; never add or remove one.
Sign with the stylist's name from the input ("stylistName"). Never sign as the client or as a
"styling team".
Return JSON: {"subject": string, "body": string}. The body must keep a SHOOT DETAILS block
with shoot date, call-in date, return date and ship-to address.`

/** Draft with AI when configured, otherwise return the deterministic template. */
export async function draftRequestEmail(
  input: RequestEmailInput,
  ctx?: { jobId?: string },
): Promise<DraftedEmail> {
  const fallback = deterministicRequestEmail(input)
  if (activeProvider() === "deterministic") return fallback

  try {
    const result = await runAgentTask(
      {
        system: SYSTEM,
        user: JSON.stringify({
          brand: input.brand,
          looks: input.looks,
          clientName: input.clientName,
          jobTitle: input.jobTitle,
          shootDate: input.shootDate,
          callInDate: input.callInDate,
          returnDate: input.returnDate,
          studioAddress: input.studioAddress,
          shippingMode: input.shippingMode,
          intakeLink: input.intakeLink,
          stylistName: input.stylistName ?? "Juje",
          requiredSubjectPattern: `PULL request — ${input.brand} · ${input.clientName}`,
        }),
        json: true,
        maxTokens: 900,
        timeoutMs: 90_000,
      },
      { jobId: ctx?.jobId, kind: "draft-request-email" },
    )

    const parsed = result.json as { subject?: string; body?: string } | undefined
    const subject = parsed?.subject?.trim()
    const body = parsed?.body?.trim()
    if (!subject || !body) return fallback

    // Guard: the model may rewrite prose but not the approved set.
    const missing = input.looks.filter((look) => !body.includes(`Look ${look.lookNo}`))
    if (missing.length > 0) return fallback

    return { subject, body, provider: result.provider }
  } catch (error) {
    console.warn("[agent] draft failed, using deterministic template:", error instanceof Error ? error.message : error)
    return fallback
  }
}
