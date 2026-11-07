/**
 * PULL demo schema — mirrors PRD §8 (prd/prd-pull-demo-3acts.md).
 * Neon Postgres + Drizzle. One stylist, many jobs, boards → looks, requests → emails → shipments.
 */
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const jobStatus = pgEnum("job_status", [
  "draft",
  "published",
  "client_reviewed",
  "requests_drafted",
  "requests_sent",
  "complete",
])

export const lookStatus = pgEnum("look_status", ["draft", "approved", "passed"])
export const lookReadSource = pgEnum("look_read_source", ["image", "filename", "sequence", "manual"])

export const requestStatus = pgEnum("request_status", [
  "draft",
  "sent",
  "awaiting_label",
  "label_sent",
  "in_transit",
  "delivered",
  "failed",
])

export const shippingMode = pgEnum("shipping_mode", ["showroom_ships", "needs_label", "unknown"])
export const emailStatus = pgEnum("email_status", [
  "draft",
  "queued",
  "sent",
  "delivered",
  "bounced",
  "complained",
])

/** The single stylist for the demo. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  studioAddress: jsonb("studio_address").$type<Record<string, string>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const boards = pgTable(
  "boards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull(),
    brand: text("brand").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("boards_job_idx").on(t.jobId)],
)

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    clientName: text("client_name").notNull(),
    /** The client's contact address — shown on the dashboard card, used when the board is sent. */
    clientEmail: text("client_email"),
    title: text("title").notNull(),
    shootDate: date("shoot_date").notNull(),
    callInDate: date("call_in_date").notNull(),
    returnDate: date("return_date").notNull(),
    status: jobStatus("status").notNull().default("draft"),
    publicTokenHash: text("public_token_hash"),
    /**
     * The raw client token is kept alongside its hash so re-publishing after edits returns the SAME
     * url (FR-7 acceptance). A hash alone cannot reproduce the token. It is still an HMAC-signed
     * opaque string — no job data, no PII — and rotating LINK_SECRET invalidates it.
     */
    publicToken: text("public_token"),
    /**
     * FR-11: submitting a review "timestamps it once" and locks further client edits. The PRD's
     * report (FR-12) quotes the submission time, so it needs a column; `status = client_reviewed`
     * alone cannot say when.
     */
    reviewSubmittedAt: timestamp("review_submitted_at", { withTimezone: true }),
    /**
     * When the stylist last acknowledged that review — the bell's unread rule is
     * `reviewSeenAt IS NULL OR reviewSeenAt < reviewSubmittedAt`. Kept on the job
     * instead of a notifications table: one source of truth, and re-publishing a
     * board moves `reviewSubmittedAt` and notifies again.
     */
    reviewSeenAt: timestamp("review_seen_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_user_idx").on(t.userId)],
)

export const looks = pgTable(
  "looks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull(),
    boardId: uuid("board_id").notNull(),
    /** Cloudinary original (the screenshot). */
    sourcePublicId: text("source_public_id"),
    /** Cloudinary delivery id used on the board (original + crop transform). */
    imagePublicId: text("image_public_id"),
    lookNo: integer("look_no").notNull(),
    season: text("season"),
    brand: text("brand").notNull().default("Unassigned"),
    confidence: numeric("confidence", { precision: 5, scale: 2 }),
    readSource: lookReadSource("read_source").notNull().default("filename"),
    ocrText: text("ocr_text"),
    status: lookStatus("status").notNull().default("draft"),
    priority: smallint("priority"),
    clientNote: text("client_note"),
    position: integer("position").notNull().default(0),
    /**
     * FR-6: deleting a look hides it from the client board but keeps it recoverable until publish.
     * The PRD's domain model has no column for this because "deleted" was assumed to mean deleted;
     * a soft-delete is what the acceptance criterion actually requires. Null = visible.
     */
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("looks_job_idx").on(t.jobId), index("looks_board_idx").on(t.boardId)],
)

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    brand: text("brand").notNull(),
    prMarket: text("pr_market"),
    // Written in the form Postgres stores it (`'{}'::text[]`), not `ARRAY[]::text[]`.
    // Known noise: drizzle-kit 0.31 re-emits `ALTER … SET DEFAULT` for this array column on every
    // `db:push`, because its comparison of an array default against the catalogue never matches.
    // Tested and it does not go away by spelling it differently, nor by `.default([])`. The statement
    // is idempotent, so this is cosmetic — but "changes applied" is not proof that anything changed.
    // Move to db:generate + db:migrate when the schema stabilises.
    emails: text("emails").array().notNull().default(sql`'{}'::text[]`),
    showroomAddress: jsonb("showroom_address").$type<Record<string, string>>(),
    shipsOnOwnAccount: boolean("ships_on_own_account").notNull().default(false),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("contacts_brand_market_idx").on(t.userId, t.brand, t.prMarket)],
)

export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull(),
    contactId: uuid("contact_id"),
    brand: text("brand").notNull(),
    status: requestStatus("status").notNull().default("draft"),
    shippingMode: shippingMode("shipping_mode").notNull().default("unknown"),
    intakeTokenHash: text("intake_token_hash"),
    /** Raw intake token, kept so the draft email can show the link again. Same reasoning as jobs.publicToken. */
    intakeToken: text("intake_token"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("requests_job_idx").on(t.jobId)],
)

export const emails = pgTable(
  "emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull(),
    requestId: uuid("request_id"),
    resendId: text("resend_id"),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: emailStatus("status").notNull().default("draft"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    inReplyTo: text("in_reply_to"),
    attachments: jsonb("attachments").$type<{ filename: string; publicId?: string }[]>(),
    /** Drafts have no sent_at; a thread needs an ordering key for "original then label reply". */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("emails_job_idx").on(t.jobId), index("emails_request_idx").on(t.requestId)],
)

export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull(),
    shippoShipmentId: text("shippo_shipment_id"),
    intake: jsonb("intake").$type<{
      length: number
      width: number
      height: number
      weightKg: number
      pickup: Record<string, string>
    }>(),
    rates: jsonb("rates").$type<
      { id: string; carrier: string; service: string; amount: number; currency: string; days: number }[]
    >(),
    chosenRateId: text("chosen_rate_id"),
    carrier: text("carrier"),
    service: text("service"),
    amountCents: integer("amount_cents"),
    currency: text("currency").default("USD"),
    etaDays: integer("eta_days"),
    labelUrl: text("label_url"),
    labelPublicId: text("label_public_id"),
    trackingNumber: text("tracking_number"),
    trackingStatus: text("tracking_status"),
    trackingUpdatedAt: timestamp("tracking_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shipments_request_idx").on(t.requestId)],
)

/** The agent's audit trail, shown as "activity" on the job page. */
export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    jobId: uuid("job_id"),
    actor: text("actor").notNull().default("agent"),
    kind: text("kind").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_job_idx").on(t.jobId)],
)
