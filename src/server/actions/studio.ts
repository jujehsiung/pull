/**
 * Studio settings. Only one row exists (the demo's single stylist), so this is deliberately a
 * single-form action rather than a CRUD surface.
 *
 * The studio address is not decoration: it is the ship-to in every request email's SHOOT DETAILS
 * block and the destination every Shippo rate is quoted for. An incomplete address previously only
 * surfaced when the intake page refused to quote — better to validate it where it is entered.
 */
"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/db/client"
import { users } from "@/db/schema"
import { requireStylist } from "@/lib/auth"

const REQUIRED = ["street1", "city", "zip", "country"] as const

export interface StudioResult {
  ok: boolean
  error?: string
}

export async function saveStudioForm(form: FormData): Promise<void> {
  const stylist = await requireStylist()

  const address: Record<string, string> = {}
  for (const key of ["name", "street1", "street2", "city", "state", "zip", "country", "phone", "email"]) {
    const value = String(form.get(key) ?? "").trim()
    if (value) address[key] = value
  }

  const missing = REQUIRED.filter((key) => !address[key])
  if (missing.length) {
    redirect(`/studio/settings?error=${encodeURIComponent(`Missing: ${missing.join(", ")}`)}`)
  }
  if (address.country && !/^[A-Za-z]{2}$/.test(address.country)) {
    redirect(`/studio/settings?error=${encodeURIComponent("Country must be a 2-letter code, e.g. US or FR.")}`)
  }

  await db().update(users).set({ studioAddress: address }).where(eq(users.id, stylist.id))
  revalidatePath("/studio/settings")
  revalidatePath("/studio/jobs/[id]", "page")
  redirect("/studio/settings?saved=1")
}
