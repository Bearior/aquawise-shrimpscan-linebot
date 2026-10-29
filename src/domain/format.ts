/**
 * Thai labels the server writes into a response, ported from the LIFF
 * (liff-app/src/lib/format.ts) so a line reads the same from either side.
 * Fixed tables, never the device or server locale.
 */
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** '20 ต.ค.' for the ISO day '2026-10-20'. */
export function fmtDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number]
  return `${d} ${MONTHS[m - 1]}`
}

/** '2 ก.ย. 2569': the day with the Buddhist year, for เข้าร่วม lines. */
export function fmtDayYear(iso: string): string {
  return `${fmtDay(iso)} ${Number(iso.slice(0, 4)) + 543}`
}

const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** 'HH:MM' in Asia/Bangkok for an instant. */
export function fmtTime(at: Date | string): string {
  return timeFormat.format(typeof at === 'string' ? new Date(at) : at)
}

/**
 * The ponds a person looks after, the mock's way: a range inside one zone,
 * a short list across zones, 'ทุกบ่อ' for none. `codes` in the farm's order.
 */
export function pondsLabel(codes: string[], zoneOf: (code: string) => string): string {
  if (!codes.length) return 'ทุกบ่อ'
  if (new Set(codes.map(zoneOf)).size === 1) return pondRange(codes)
  return codes.length <= 4 ? codes.join(' ') : `${codes.slice(0, 3).join(' ')} และอีก ${codes.length - 3} บ่อ`
}

/** Range of pond codes for a sorted list: 'F01 ถึง F10', one code alone, '' for none. */
export function pondRange(codes: string[]): string {
  if (!codes.length) return ''
  if (codes.length === 1) return codes[0]!
  return `${codes[0]} ถึง ${codes[codes.length - 1]}`
}
