/**
 * Zones and pond names, as onboarding and แก้ไขโซนและบ่อ build them.
 *
 * A zone is the leading Latin letters of its ponds' names (the server's
 * `zoneOf`): A01 is zone A. Its name ('หน้าบ้าน') is only what people read,
 * so a pond's name always keeps its zone letters at its head.
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
/** The server's limits (src/routes/liff/session.ts, src/domain/settings.ts). */
export const MAX_PONDS = 300
export const MAX_CODE = 20
export const ZONE_NAME_MAX = 30
/** Ponds one zone may have, and one add may make. */
export const MAX_PER_ZONE = 60

/** The zone a pond name is filed under: its leading Latin letters; '1' for a name of numbers only. */
export function zoneOf(code: string): string {
  return /^[A-Za-z]+/.exec(code)?.[0]?.toUpperCase() ?? '1'
}

/** A zone as people read it: the name the owner gave it, else โซน A. */
export function zoneLabel(zone: string, name?: string | null): string {
  return name?.trim() ? name.trim() : `โซน ${zone}`
}

/** The head every pond of the zone starts with: 'A'; nothing for a zone of numbers only. */
export const prefixOf = (zone: string) => (zone === '1' ? '' : zone)

/** The default name of the zone's i-th pond (from 0): A01, A02; 01 for a zone of numbers only. */
export const defaultCode = (zone: string, i: number) => `${prefixOf(zone)}${String(i + 1).padStart(2, '0')}`

/**
 * The next `n` free names in a zone: counting on from the highest number a
 * pond of the zone already ends in (A10 then A11), skipping any name taken.
 */
export function nextCodes(zone: string, existing: string[], n: number): string[] {
  const head = prefixOf(zone)
  const taken = new Set(existing.map((c) => c.toUpperCase()))
  let top = 0
  for (const c of existing) {
    if (zoneOf(c) !== zone) continue
    const num = /^\d+$/.exec(c.slice(head.length))
    if (num) top = Math.max(top, Number(num[0]))
  }
  const out: string[] = []
  for (let i = top; out.length < n; i++) {
    const code = defaultCode(zone, i)
    if (!taken.has(code.toUpperCase())) out.push(code)
  }
  return out
}

/** The first letter no zone has yet; null once A to Z are all in use. */
export function nextZoneLetter(zones: string[]): string | null {
  return LETTERS.split('').find((l) => !zones.includes(l)) ?? null
}

/** Why a pond can not take this name, or null when it can. `rest` is what follows the zone letters. */
export function pondNameProblem(zone: string, rest: string, taken: (code: string) => boolean): string | null {
  const r = rest.trim()
  if (!r) return null
  // The server files a pond under its leading Latin letters: 'AB1' would be zone AB, not A.
  if (prefixOf(zone) && /^[A-Za-z]/.test(r)) return `ต่อจาก ${zone} ด้วยตัวเลขหรือคำไทยค่ะ`
  if (!prefixOf(zone) && /^[A-Za-z]/.test(r)) return 'ขึ้นต้นด้วยตัวเลขหรือคำไทยค่ะ'
  const code = `${prefixOf(zone)}${r}`
  if (code.length > MAX_CODE) return `ยาวได้ไม่เกิน ${MAX_CODE} ตัวค่ะ`
  if (taken(code)) return `มีบ่อชื่อ ${code} แล้วค่ะ`
  return null
}
