/** Read side of the contacts book (FR-15): the stylist's brand + market -> PR contact rows. */
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/db/client"
import { contacts } from "@/db/schema"

export type ContactRow = typeof contacts.$inferSelect

/** All contacts for one stylist, brand order — the userId is always required, never trusted. */
export async function listContacts(userId: string): Promise<ContactRow[]> {
  return db()
    .select()
    .from(contacts)
    .where(eq(contacts.userId, userId))
    .orderBy(asc(contacts.brand), asc(contacts.prMarket))
}

/** Ownership is part of the query: an id alone never reaches another stylist's book. */
export async function getContact(userId: string, id: string): Promise<ContactRow | null> {
  const [row] = await db()
    .select()
    .from(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.id, id)))
    .limit(1)
  return row ?? null
}
