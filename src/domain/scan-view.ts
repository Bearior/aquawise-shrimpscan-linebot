/**
 * A measured scan as the LIFF reads it, built from the stored row alone, so a
 * later read says what the measure said.
 *
 * Grams per shrimp need `shrimp_len_px` (line-bot migration 210). On a
 * database without it a re-read keeps the count, the average, the spread and
 * the dots, and no grams per shrimp: never invented ones.
 *
 * A shrimp's weight is the sizing service's own `weight_g` (the median of
 * seven literature W = a·L^b formulas), ported from line-bot
 * src/scan/shrimp-size.ts. Keep LWF equal to it.
 */

import type { Pt, Scan, ScanResult } from '../contract/types.js'
import type { MemberRow, ScanRow } from '../data/types.js'
import { effective } from './permissions.js'
import { canvasToPhoto, ringToEllipse, ringToPoints } from './rim-geometry.js'

/** line-bot RIM_ADJUSTMENTS_MAX: free re-measures of one photo (a rim moved or another ยอ). */
export const REMEASURES_MAX = 3
export const REMEASURE_FLAG = 'remeasure'
const SIZE_FLAG = /^size:(\d+)x(\d+)$/
/** 1000 shrimp's worth, as line-bot caps shrimp_len_px. */
const SHRIMP_LEN_MAX = 1000

const LWF: ReadonlyArray<readonly [number, number]> = [
  [0.0108, 2.6935],
  [0.01288, 3.261],
  [0.00462, 3.655],
  [0.00787, 2.966],
  [0.004808, 3.201],
  [0.008128, 2.997],
  [0.00537, 3.322],
]

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100
const isPositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

/** One shrimp's weight in grams from its length in cm: measure.py's `weight_g`. */
export function shrimpWeightG(lengthCm: number): number {
  const w = LWF.map(([a, b]) => a * lengthCm ** b).sort((x, y) => x - y)
  return w[(w.length - 1) / 2]!
}

/** The length of a shrimp of this weight: the average shrimp, when no lengths are stored. */
export function lengthAtWeight(g: number): number {
  // Every formula rises with length, so their median does: halve the bracket.
  let lo = 0
  let hi = 60
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (shrimpWeightG(mid) < g) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Each kept shrimp's length in canvas px, in `shrimp_xy` order, from the
 * service's `length_cm` at the diameter it measured with (px = cm × 2R / d).
 * Null unless every shrimp has a usable length.
 */
export function shrimpLenPx(shrimp: unknown, rimRadiusPx: unknown, diameterCm: unknown): number[] | null {
  if (!Array.isArray(shrimp) || shrimp.length === 0 || shrimp.length > SHRIMP_LEN_MAX) return null
  if (!isPositive(rimRadiusPx) || !isPositive(diameterCm)) return null
  const pxPerCm = (2 * rimRadiusPx) / diameterCm
  const out: number[] = []
  for (const s of shrimp) {
    const cm = s !== null && typeof s === 'object' ? (s as { length_cm?: unknown }).length_cm : undefined
    if (!isPositive(cm)) return null
    out.push(round2(cm * pxPerCm))
  }
  return out
}

/** Per shrimp at the row's ยอ: length in cm (1 decimal) and grams (2). Null when a piece is missing or they do not pair with the dots. */
export function shrimpSizes(row: Pick<ScanRow, 'lenPx' | 'shrimpXy' | 'rimRadiusPx' | 'refCm'>): { cm: number[]; g: number[] } | null {
  const { lenPx: px, shrimpXy: xy, rimRadiusPx: r, refCm: d } = row
  if (!px || !xy || px.length === 0 || xy.length !== px.length * 2) return null
  if (!isPositive(r) || !isPositive(d)) return null
  const cmPerPx = d / (2 * r)
  const cm: number[] = []
  const g: number[] = []
  for (const p of px) {
    if (!isPositive(p)) return null
    cm.push(round1(p * cmPerPx))
    g.push(round2(shrimpWeightG(p * cmPerPx)))
  }
  return { cm, g }
}

/** The photo's px from its `size:<W>x<H>` flag (prod keeps no photo size column). */
export function photoSizeOf(flags: string[]): { width: number; height: number } | null {
  for (const f of flags) {
    const m = SIZE_FLAG.exec(f)
    if (m) return { width: Number(m[1]), height: Number(m[2]) }
  }
  return null
}

export function remeasuresOf(flags: string[]): number {
  return flags.filter((f) => f === REMEASURE_FLAG).length
}

/** Where น้ำ found each shrimp, on the photo (0..1), with no size. Null when the row has no dots. */
export function foundOf(row: Pick<ScanRow, 'shrimpXy' | 'rim' | 'rimRadiusPx' | 'canvasPx'>, W: number, H: number): Pt[] | null {
  const { shrimpXy: xy, rim, rimRadiusPx: r, canvasPx: c } = row
  if (!xy || xy.length % 2 !== 0 || !rim || rim.length !== 5 || !isPositive(r) || !isPositive(c)) return null
  const e = ringToEllipse(rim)
  const out: Pt[] = []
  for (let i = 0; i < xy.length; i += 2) {
    const p = canvasToPhoto({ x: xy[i]! * c, y: xy[i + 1]! * c }, e, r, c, W, H)
    out.push({ x: p.x, y: p.y })
  }
  return out
}

/** A measured row (status 'ok') as its result; `net` is the ยอ it was measured with, `previous` the pond's saved scan before it. */
export function toScanResult(row: ScanRow, net: { id: string; cm: number }, W: number, H: number, previous: ScanResult['previous']): ScanResult {
  const dots = foundOf(row, W, H) ?? []
  const sizes = shrimpSizes(row)
  const sized = sizes && sizes.g.length === dots.length ? sizes : null
  const abw = row.abw ?? 0
  return {
    abw,
    perKg: row.perKg ?? 0,
    lengthCm: round1(sized ? sized.cm.reduce((a, b) => a + b, 0) / sized.cm.length : lengthAtWeight(abw)),
    count: row.n ?? 0,
    cv: row.cv ?? 0,
    shrimp: sized ? dots.map((p, i) => ({ x: p.x, y: p.y, g: sized.g[i]! })) : [],
    rim: row.rim ? ringToPoints(row.rim, W, H) : [],
    net: { id: net.id, shape: 'round', cm: net.cm },
    measuredAt: row.measuredAt ?? row.createdAt,
    remeasuresLeft: Math.max(0, REMEASURES_MAX - remeasuresOf(row.flags)),
    previous,
  }
}

/** The photo's sender measures and saves it; an owner or manager may for anyone (measureInbox). */
export function mayMeasure(me: MemberRow, row: Pick<ScanRow, 'lineUserId'>): boolean {
  return row.lineUserId === me.lineUserId || effective(me.role).measureInbox
}

/** A worker sees no number: their scan carries `found` and never `result`. */
export function scanFor(me: MemberRow, scan: Scan): Scan {
  return me.role === 'worker' ? { ...scan, result: null } : scan
}
