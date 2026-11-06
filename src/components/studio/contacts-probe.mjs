import { readFileSync } from "node:fs"
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}
const { neon } = await import("@neondatabase/serverless")
const sql = neon(process.env.DATABASE_URL)
const users = await sql`select id, email from users`
const contacts = await sql`select id, user_id, brand, pr_market, emails, showroom_address, ships_on_own_account from contacts order by brand`
const jobs = await sql`select id, user_id, client_name, status from jobs`
console.log(JSON.stringify({ users, contacts, jobs }, null, 2))
