/**
 * Thai dates and numbers, with fixed tables instead of the device locale: a
 * phone set to Burmese must still read Thai months and Latin digits here.
 *
 * Dates are ISO calendar days ('2026-10-20'), instants ISO timestamps. Times
 * are shown in Asia/Bangkok (UTC+7, no daylight saving).
 */
const WD_LONG = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const WD_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function parts(iso: string): { y: number; m: number; d: number; wd: number } {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number]
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return { y, m, d, wd }
}

/** '20 ต.ค.' */
export function fmtDay(iso: string): string {
  const p = parts(iso)
  return `${p.d} ${MONTHS[p.m - 1]}`
}

/** '20 ต.ค. 2569' (Buddhist year) */
export function fmtDayYear(iso: string): string {
  const p = parts(iso)
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y + 543}`
}

/** 'อังคาร 20 ต.ค.' */
export function fmtWeekday(iso: string): string {
  const p = parts(iso)
  return `${WD_LONG[p.wd]} ${p.d} ${MONTHS[p.m - 1]}`
}

/** 'อังคาร 20 ต.ค. 2569' */
export function fmtWeekdayYear(iso: string): string {
  return `${fmtWeekday(iso)} ${parts(iso).y + 543}`
}

/** 'พฤ. 22 ต.ค.' */
export function fmtWeekdayShort(iso: string): string {
  const p = parts(iso)
  return `${WD_SHORT[p.wd]} ${p.d} ${MONTHS[p.m - 1]}`
}

/** 'อ. 27 ต.ค.' with วันนี้ for today. */
export function fmtQueueDay(iso: string, today: string): string {
  return iso.slice(0, 10) === today ? 'วันนี้' : fmtWeekdayShort(iso)
}

/** Day of the month only, for the queue chart axis. */
export function dayOfMonth(iso: string): number {
  return parts(iso).d
}

export function monthShort(iso: string): string {
  return MONTHS[parts(iso).m - 1]!
}

/** '07:28' in Bangkok time. */
export function fmtTime(instant: string): string {
  const t = new Date(instant).getTime() + 7 * 3600_000
  const d = new Date(t)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** The Bangkok calendar day of an instant. */
export function bangkokDay(instant: string | number): string {
  const d = new Date(new Date(instant).getTime() + 7 * 3600_000)
  return d.toISOString().slice(0, 10)
}

/** 'วันนี้ 07:28' · 'เมื่อวาน 17:12' · '15 ต.ค. 10:04' */
export function fmtWhen(instant: string, today: string): string {
  const day = bangkokDay(instant)
  const t = fmtTime(instant)
  if (day === today) return `วันนี้ ${t}`
  if (day === addDays(today, -1)) return `เมื่อวาน ${t}`
  return `${fmtDay(day)} ${t}`
}

export function addDays(iso: string, n: number): string {
  const p = parts(iso)
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d + n))
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  const a = parts(from)
  const b = parts(to)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000)
}

const INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
/** '220,000' */
export function fmtInt(n: number): string {
  return INT.format(n)
}

/** One decimal: '24.6' */
export function fmt1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1)
}

/** Tonnes: '4.4' under 10, '21.7', '90' at 50 and up. */
export function fmtTonnes(t: number): string {
  return t >= 50 ? String(Math.round(t)) : fmt1(t)
}

/** Range of pond codes for a sorted list: 'F01 ถึง F10', or a joined list when not a run. */
export function pondRange(codes: string[]): string {
  if (!codes.length) return ''
  if (codes.length === 1) return codes[0]!
  return `${codes[0]} ถึง ${codes[codes.length - 1]}`
}
