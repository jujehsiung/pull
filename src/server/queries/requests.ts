/** Read side of Act 2's requests page: requests, their draft emails and resolved contacts. */
import { and, asc, eq, inArray } from "drizzle-orm"
import { db } from "@/db/client"
import { contacts, emails, requests } from "@/db/schema"

export interface RequestView {
  id: string
  brand: string
  status: string
  shippingMode: string
  intakeToken: string | null
  contact: { emails: string[]; shipsOnOwnAccount: boolean; showroomAddress: Record<string, string> | null } | null
  email: {
    id: string
    toEmail: string
    subject: string
    body: string
    status: string
    resendId: string | null
    sentAt: Date | null
  } | null
}

export async function getRequestsView(userId: string, jobId: string): Promise<{ requests: RequestView[]; missingContacts: string[] }> {
  const requestRows = await db()
    .select()
    .from(requests)
    .where(eq(requests.jobId, jobId))
    .orderBy(asc(requests.createdAt))

  const contactIds = requestRows.map((row) => row.contactId).filter((id): id is string => Boolean(id))
  const contactRows = contactIds.length
    ? await db().select().from(contacts).where(inArray(contacts.id, contactIds))
    : []
  const emailRows = await db().select().from(emails).where(and(eq(emails.jobId, jobId)))

  const views: RequestView[] = requestRows.map((request) => {
    const contact = contactRows.find((row) => row.id === request.contactId)
    const email = emailRows.find((row) => row.requestId === request.id) ?? null
    return {
      id: request.id,
      brand: request.brand,
      status: request.status,
      shippingMode: request.shippingMode,
      intakeToken: request.intakeToken,
      contact: contact
        ? {
            emails: contact.emails ?? [],
            shipsOnOwnAccount: contact.shipsOnOwnAccount,
            showroomAddress: contact.showroomAddress ?? null,
          }
        : null,
      email: email
        ? {
            id: email.id,
            toEmail: email.toEmail,
            subject: email.subject,
            body: email.body,
            status: email.status,
            resendId: email.resendId,
            sentAt: email.sentAt,
          }
        : null,
    }
  })

  // A brand with no contact is blocked, not guessed (FR-15).
  const missingContacts = views.filter((view) => !view.contact?.emails.length).map((view) => view.brand)
  return { requests: views, missingContacts }
}
