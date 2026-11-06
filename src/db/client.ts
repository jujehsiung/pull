/** Drizzle client on Neon's HTTP driver (works in Vercel serverless functions). */
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

export function db() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not set — connect Neon in .env.local (see SETUP.md step 2)")
  }
  return drizzle(neon(url), { schema })
}

export type Db = ReturnType<typeof db>
export { schema }
