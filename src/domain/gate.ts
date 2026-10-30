/**
 * รหัสเข้าร่วม: one shared code a new owner types before making a farm, the
 * way น้องน้ำ's phase-1 beta gate works (line-bot `src/lib/beta-gate.ts`).
 * No table, no quota, no expiry: does the code equal `BETA_ACCESS_CODE`.
 *
 * UNSET = OPEN, as in line-bot: with no `BETA_ACCESS_CODE` any non-empty code
 * passes and `/start` asks for none, so a missing env var never locks every
 * new farm out. Set it on the service to make the code count.
 *
 * Nothing is stamped on `line_users`: that row is shared with น้องน้ำ, whose
 * own gate reads `gate_passed_at`, so a stamp here would open น้องน้ำ too.
 * The LIFF sends the code again with `/start`, which checks it there.
 */

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '')
}

/** The configured code, or null when the gate is open. */
export function accessCode(): string | null {
  const raw = process.env.BETA_ACCESS_CODE
  if (!raw || !raw.trim()) return null
  return normalizeCode(raw)
}

/** No early exit on the first different letter. The code is not a password, but there is no reason to leak it. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function isValidCode(raw: unknown): boolean {
  if (typeof raw !== 'string') return false
  const expected = accessCode()
  if (expected === null) return raw.trim().length > 0
  return same(normalizeCode(raw), expected)
}
