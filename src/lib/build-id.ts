/**
 * Build stamp for the stale-bundle self-heal (ported from line-bot).
 *
 * The Docker builder writes a fresh id to `/app/build-id` and bakes the SAME id
 * into the LIFF bundle. `/api/liff-config` returns this server id so the LIFF
 * can compare it with its baked id and reload once when LINE's webview cache
 * serves a stale bundle. Missing or unreadable file gives `'unknown'`; this
 * never throws at boot.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

/** env override, else `<cwd>/build-id` (Cloud Run cwd is `/app`). */
function buildIdPath(): string {
  return process.env.BUILD_ID_FILE ?? path.resolve(process.cwd(), 'build-id')
}

export function readBuildId(filePath: string = buildIdPath()): string {
  try {
    return readFileSync(filePath, 'utf8').trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Read once at boot: the id cannot change for the life of the container. */
export const BUILD_ID = readBuildId()
