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
