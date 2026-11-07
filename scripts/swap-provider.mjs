#!/usr/bin/env node
/**
 * agent:swap — point the app at a different agent backend, in one command.
 *
 *   npm run agent:swap deepseek        # today: DeepSeek Platform (pre-credit)
 *   npm run agent:swap zoowork         # the day the key lands: Managed Agents
 *   npm run agent:swap auto            # precedence decides (zoowork > deepseek > deterministic)
 *
 * Why a script and not a doc line: the swap happens under time pressure, once,
 * in front of judges. Editing .env and restarting by hand is how you end up
 * demoing the fallback. This rewrites AGENT_PROVIDER in .env.local and tells you
 * exactly which key is still missing.
 *
 * It never prints or copies a key — it only checks whether one is present.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"

const TARGETS = {
  deepseek: { needs: ["DEEPSEEK_API_KEY"], note: "https://platform.deepseek.com/api_keys", model: "DEEPSEEK_MODEL" },
  zoowork: { needs: ["ZOOWORK_API_KEY"], note: "ZOOWORK_ENABLED=true is also required", model: "ZOOWORK_MODEL" },
  auto: { needs: [], note: "precedence: zoowork > deepseek > deterministic", model: null },
}

const target = (process.argv[2] ?? "").toLowerCase()
if (!TARGETS[target]) {
  console.error(`\n  usage: npm run agent:swap <${Object.keys(TARGETS).join("|")}>\n`)
  process.exit(1)
}

const FILE = ".env.local"
if (!existsSync(FILE)) {
  console.error(`\n  ${FILE} does not exist — copy .env.example first\n`)
  process.exit(1)
}

const original = readFileSync(FILE, "utf8")
const line = `AGENT_PROVIDER=${target}`

// `auto` is not a value the env schema accepts (AGENT_PROVIDER is a closed
// enum), so for auto we REMOVE the line and let precedence decide. Writing
// AGENT_PROVIDER=auto would fail the zod parse and blank every other key.
let updated
if (target === "auto") {
  updated = original.replace(/^AGENT_PROVIDER=.*\n?/m, "")
} else if (/^AGENT_PROVIDER=.*$/m.test(original)) {
  updated = original.replace(/^AGENT_PROVIDER=.*$/m, line)
} else {
  updated = original.replace(/\n?$/, `\n${line}\n`)
}
writeFileSync(FILE, updated)

/* ── report ─────────────────────────────────────────────────────────────── */

const read = readFileSync(FILE, "utf8")
const has = (key) => new RegExp(`^${key}=\\s*\\S`, "m").test(read)

console.log(`\n  AGENT_PROVIDER=${target === "auto" ? "(unset — precedence decides)" : target}\n`)

const spec = TARGETS[target]
if (target === "auto") {
  console.log(`  ${spec.note}`)
} else {
  if (target === "zoowork" && !has("ZOOWORK_ENABLED")) {
    console.log("  ! ZOOWORK_ENABLED is not set — ZooWork stays inert until it is `true`")
  }
  for (const key of spec.needs) {
    console.log(`  ${has(key) ? "✓" : "!"} ${key} ${has(key) ? "present" : `missing — ${spec.note}`}`)
  }
  if (spec.model) {
    const m = new RegExp(`^${spec.model}=(.*)$`, "m").exec(read)
    if (m?.[1]?.trim()) console.log(`    model: ${m[1].trim()}`)
  }
}

console.log("\n  Restart the dev server for the change to take effect:")
console.log("    npm run dev\n")
console.log("  Confirm live: http://localhost:3000/api/agent/status")
console.log("  Visible in the UI: the badge in the studio header and on /trace\n")
