/**
 * สแกนวันนี้'s 13-week grid: one square a day, how much of the farm was
 * scanned that morning. Pure, no React, no clock.
 *
 * The geometry is line-bot's สมุดฟาร์ม graph (`home-v6/diary-graph.ts` on
 * launch-prep), kept the same on purpose: every cell gets an x and y from the
 * same constants the labels are placed from, so a month name can never drift
 * off the column it names (two CSS-grid attempts there did). Monday-first
 * rows (จ. to อา.), columns oldest to newest, the last column the week `through`
 * falls in, nothing drawn after `through`.
 *
 * What differs is the level: line-bot counts records, this counts the share
 * of the farm's ponds scanned, so a full square means every pond that day.
 */

/** Cell edge, in viewBox units. */
export const CELL = 11
/** Gap between cells. */
export const GAP = 3
/** Column and row pitch. */
export const STEP = CELL + GAP
export const CELL_RADIUS = 2.5
/** x of the first column; the gutter left of it holds จ. พ. ศ. */
export const DAY_GUTTER = 27
/** x the day labels end at. */
export const DAY_LABEL_X = 21
/** y of the first row; the band above it holds the month names. */
export const MONTH_BAND = 19
export const MONTH_LABEL_Y = 11.5
export const WEEKS = 13

/** Level 0 to 4, light to dark: none, under half, under 80%, nearly, every pond. line-bot's ramp. */
export const RAMP = ['#EFEFF4', '#CFE0F3', '#9FC3E8', '#5C97D6', '#1F6BB8'] as const

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const DAY_LABELS = [
  { row: 0, text: 'จ.' },
  { row: 2, text: 'พ.' },
  { row: 4, text: 'ศ.' },
]
const DAY_MS = 86_400_000

export interface GridCell {
  date: string
  done: number
  level: number
  x: number
  y: number
}

export interface GridLabel {
  text: string
  x: number
  y: number
}

export interface GridLayout {
  width: number
  height: number
  cells: GridCell[]
  months: GridLabel[]
  days: GridLabel[]
}

/** How full a day reads, from the ponds scanned against the farm's ponds. */
export function levelFor(done: number, total: number): number {
  if (done <= 0 || total <= 0) return 0
  const share = done / total
  if (share >= 1) return 4
  if (share >= 0.8) return 3
  if (share >= 0.5) return 2
  return 1
}

function parseIso(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const t = Date.parse(`${iso}T00:00:00Z`)
  return Number.isNaN(t) ? null : t
}

const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
/** 0 = Monday … 6 = Sunday. */
const mondayRow = (ms: number) => (new Date(ms).getUTCDay() + 6) % 7

/** `weeks` columns of days ending on `through`; null when `through` is not a date. */
export function buildScanGrid(history: ReadonlyArray<{ date: string; done: number }>, total: number, through: string, weeks = WEEKS): GridLayout | null {
  const end = parseIso(through)
  if (end === null) return null
  const done = new Map<string, number>()
  for (const h of history) done.set(h.date, Math.max(done.get(h.date) ?? 0, h.done))

  const endMonday = end - mondayRow(end) * DAY_MS
  const start = endMonday - (weeks - 1) * 7 * DAY_MS
  const cells: GridCell[] = []
  for (let ms = start; ms <= end; ms += DAY_MS) {
    const date = toIso(ms)
    const n = done.get(date) ?? 0
    cells.push({
      date,
      done: n,
      level: levelFor(n, total),
      x: DAY_GUTTER + Math.floor((ms - start) / (7 * DAY_MS)) * STEP,
      y: MONTH_BAND + mondayRow(ms) * STEP,
    })
  }

  // A month is named at the column holding its 1st; a month whose 1st fell before the window gets no name.
  const months: GridLabel[] = []
  const first = new Date(start)
  let cursor = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)
  while (cursor <= end) {
    if (cursor >= start) {
      months.push({ text: MONTHS[new Date(cursor).getUTCMonth()]!, x: DAY_GUTTER + Math.floor((cursor - start) / (7 * DAY_MS)) * STEP, y: MONTH_LABEL_Y })
    }
    const c = new Date(cursor)
    cursor = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1)
  }

  return {
    width: DAY_GUTTER + weeks * STEP - GAP,
    height: MONTH_BAND + 7 * STEP - GAP,
    cells,
    months,
    days: DAY_LABELS.map((d) => ({ text: d.text, x: DAY_LABEL_X, y: MONTH_BAND + d.row * STEP + CELL / 2 })),
  }
}
