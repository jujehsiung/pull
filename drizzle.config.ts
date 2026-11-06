import { defineConfig } from "drizzle-kit"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Drizzle Kit runs outside Next, so load .env.local / .env here — the same order Next uses.
 * Keeps `npm run db:push` working without extra dotenv flags.
 *
 * The directory comes from process.cwd(), not import.meta.dirname: drizzle-kit bundles this file
 * (esbuild → CJS) and import.meta is undefined inside the bundle, which made every db:push die with
 * `The "paths[0]" argument must be of type string. Received undefined` before it touched the network.
 * drizzle.config.ts lives at the package root, and npm scripts run there, so cwd is the same place.
 */
function loadEnv() {
  const root = process.cwd()
  for (const file of [".env.local", ".env"]) {
    const path = resolve(root, file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const [, key, rawValue] = match
      const value = rawValue.replace(/^["']|["']$/g, "").trim()
      if (value && !process.env[key]) process.env[key] = value
    }
  }
}

loadEnv()

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
})
