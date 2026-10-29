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

/** Range of pond codes for a sorted list: 'F01 ถึง F10', one code alone, '' for none. */
export function pondRange(codes: string[]): string {
  if (!codes.length) return ''
  if (codes.length === 1) return codes[0]!
  return `${codes[0]} ถึง ${codes[codes.length - 1]}`
}
