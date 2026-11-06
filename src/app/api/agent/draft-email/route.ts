import { NextResponse } from "next/server"
import { z } from "zod"
import { draftRequestEmail } from "@/lib/agent/email"

/**
 * POST /api/agent/draft-email — draft one brand request email.
 * Uses DeepSeek/ZooWork when configured, otherwise the deterministic template.
 * ZooWork is guarded by ZOOWORK_ENABLED (billing approval), so this route cannot create or
 * start an Agent unless a human set that flag.
 */
const bodySchema = z.object({
  brand: z.string().min(1),
  looks: z
    .array(z.object({ lookNo: z.number().int().positive(), season: z.string().optional() }))
    .min(1),
  clientName: z.string().min(1),
  jobTitle: z.string().default(""),
  shootDate: z.string(),
  callInDate: z.string(),
  returnDate: z.string(),
  studioAddress: z.string(),
  shippingMode: z.enum(["showroom_ships", "needs_label", "unknown"]).default("unknown"),
  intakeLink: z.string().url().optional(),
  jobId: z.string().optional(),
})

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 })
  }
  const { jobId, ...input } = parsed.data
  try {
    const draft = await draftRequestEmail(input, { jobId })
    return NextResponse.json(draft)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
