/**
 * Is the shared database what the OA needs? Read only.
 *
 *   pnpm db:smoke
 *
 * Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment (or
 * .env), says which project they point at (prod or staging, never the URL),
 * then runs the checks in db-smoke-checks.ts. Writes nothing. Refuses to run
 * when either variable is unset.
 */
import { getDb } from '../src/lib/db.js'
import { scanDailyLimit } from '../src/domain/farm.js'
import { dbLabel, smokeChecks } from './db-smoke-checks.js'

if (!process.env.K_SERVICE) {
  try {
    ;(await import('dotenv')).config()
  } catch {}
}

const url = process.env.SUPABASE_URL?.trim()
const db = getDb()
if (!url || !db) {
  console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is unset. Nothing was checked.')
  process.exit(1)
}

console.log(`database                   ${dbLabel(url)}`)
const { ok, lines } = await smokeChecks(db, scanDailyLimit())
for (const l of lines) console.log(l)
process.exit(ok ? 0 : 1)
