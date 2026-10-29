/**
 * Farm-wide rules the routes share: the target size, pond zones, the daily
 * scan limit and the farm's calendar day.
 */

/** จับขายที่ไซส์ when the owner never chose one (the mock's blankFarm). */
export const DEFAULT_TARGET_PER_KG = 40

/** The sizes the owner can choose (Overview.tsx TARGETS). */
export const TARGET_CHOICES: readonly number[] = [30, 35, 40, 45, 50]

/** The web scan's limit, used until SCAN_DAILY_LIMIT says otherwise. */
export const DEFAULT_SCAN_DAILY_LIMIT = 20

/** Scans one farm can pay for in a day. */
export function scanDailyLimit(): number {
  const n = Number(process.env.SCAN_DAILY_LIMIT)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_SCAN_DAILY_LIMIT
}

/** A pond's zone: the code's leading letters, upper case ('a01' is 'A'), else '1'. */
export function zoneOf(code: string): string {
  return /^[A-Za-z]+/.exec(code)?.[0]?.toUpperCase() ?? '1'
}

const bangkokDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The calendar day in Asia/Bangkok, 'YYYY-MM-DD'. */
export function bangkokDay(at: Date = new Date()): string {
  return bangkokDayFormat.format(at)
}

function partsOf(day: string): [number, number, number] {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return [y, m, d]
}

/** 'YYYY-MM-DD' plus n calendar days. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = partsOf(day)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Whole calendar days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  const [ay, am, ad] = partsOf(from)
  const [by, bm, bd] = partsOf(to)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** A real calendar day written 'YYYY-MM-DD' ('2026-13-01' is not). */
export function isDay(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return addDays(s, 0) === s
}
