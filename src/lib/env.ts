/** Typed environment access. Nothing crashes at build time when a key is missing. */
import { z } from "zod"

const schema = z.object({
  DATABASE_URL: z.string().url().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),

  SHIPPO_API_KEY: z.string().optional(),
  SHIPPO_WEBHOOK_SECRET: z.string().optional(),

  AUTH_SECRET: z.string().optional(),
  LINK_SECRET: z.string().optional(),
  // One address or a comma/space separated list — the stylist, plus any test inbox. Validated by
  // allowedEmails() below, not by .email(), because a list would fail that check and wipe the parse.
  AUTH_ALLOWED_EMAIL: z.string().optional(),
  PUBLIC_BASE_URL: z.string().url().optional(),

  OPENAI_API_KEY: z.string().optional(),

  // Agent inference — DeepSeek for the pre-credit demo, ZooWork Managed Agents when funded.
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().url().optional(),
  AGENT_PROVIDER: z.enum(["deterministic", "deepseek", "zoowork"]).optional(),
  ZOOWORK_API_KEY: z.string().optional(),
  ZOOWORK_MODEL: z.string().optional(),
  ZOOWORK_BASE_URL: z.string().url().optional(),
  ZOOWORK_ENABLED: z.enum(["true", "false"]).optional(),
})

export type Env = z.infer<typeof schema>

let cached: Env | null = null

/**
 * Only the keys we declare, and empty strings become undefined.
 * (An empty `DATABASE_URL=` in .env.local must not fail `.url()` validation and wipe every other key.)
 */
function relevantEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(schema.shape) as (keyof typeof schema.shape)[]) {
    const value = process.env[String(key)]
    if (value && value.trim()) out[String(key)] = value.trim()
  }
  return out
}

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(relevantEnv())
    cached = parsed.success ? parsed.data : ({} as Env)
  }
  return cached
}

/**
 * Who may sign in. AUTH_ALLOWED_EMAIL takes one address or a list
 * (`stylist@studio.com, test@second-device.com`), so the same demo can be opened on more than one
 * inbox without editing code. Comparison is case-insensitive and whitespace-tolerant.
 */
export function allowedEmails(): string[] {
  return (env().AUTH_ALLOWED_EMAIL ?? "")
    .split(/[,\s]+/)
    .map((address) => address.trim().toLowerCase())
    .filter((address) => address.includes("@"))
}

export function isAllowedEmail(email: string): boolean {
  const needle = email.trim().toLowerCase()
  return Boolean(needle) && allowedEmails().includes(needle)
}

export type ServiceName =
  | "Neon"
  | "Cloudinary"
  | "Resend"
  | "Shippo"
  | "Auth secrets"
  | "Agent inference"

export interface ServiceStatus {
  name: ServiceName
  configured: boolean
  variables: string[]
  docs: string
}

/** Used by the setup screen and `npm run check`. */
export function serviceStatuses(): ServiceStatus[] {
  const e = env()
  return [
    {
      name: "Neon",
      configured: Boolean(e.DATABASE_URL),
      variables: ["DATABASE_URL"],
      docs: "https://console.neon.tech",
    },
    {
      name: "Cloudinary",
      configured: Boolean(e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_API_KEY && e.CLOUDINARY_API_SECRET),
      variables: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
      docs: "https://console.cloudinary.com/settings/api-keys",
    },
    {
      name: "Resend",
      configured: Boolean(e.RESEND_API_KEY),
      variables: ["RESEND_API_KEY", "RESEND_FROM"],
      docs: "https://resend.com/api-keys",
    },
    {
      name: "Shippo",
      configured: Boolean(e.SHIPPO_API_KEY),
      variables: ["SHIPPO_API_KEY"],
      docs: "https://app.goshippo.com/settings/api",
    },
    {
      name: "Auth secrets",
      configured: Boolean(e.AUTH_SECRET && e.LINK_SECRET && e.AUTH_ALLOWED_EMAIL),
      variables: ["AUTH_SECRET", "LINK_SECRET", "AUTH_ALLOWED_EMAIL"],
      docs: "/setup",
    },
    {
      name: "Agent inference",
      configured: Boolean(e.DEEPSEEK_API_KEY || (e.ZOOWORK_API_KEY && e.ZOOWORK_ENABLED === "true")),
      variables: ["DEEPSEEK_API_KEY", "ZOOWORK_API_KEY", "ZOOWORK_ENABLED"],
      docs: "https://zoowork.ai/docs/get-started/quickstart.md",
    },
  ]
}
