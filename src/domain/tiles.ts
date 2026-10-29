/**
 * One pond as a tile (PondTile), from its saved scans. The status order and
 * the wording are the mock store's `tile()` and `issueOf()`
 * (liff-app/dev-mock/store.ts); the mock seeds each pond's kind, this reads it
 * from the numbers.
 */

import type { PondStatus, PondTile } from '../contract/types.js'
import type { PondRow } from '../data/types.js'
import { addDays, daysBetween, zoneOf } from './farm.js'

/** Growing this slowly or slower is urgent (the mock's 'โตช้ามาก'). */
export const SLOW_G_PER_DAY = 0.2
/** Sizes this uneven or worse are watch (the mock's watch ponds carry CV 0.15). */
export const UNEVEN_CV = 0.15
/** Within this many days of the target is ready. */
export const READY_DAYS = 5
/** Growth is read over this many of the latest samples. */
export const GROWTH_WINDOW = 4

const round2 = (n: number) => Math.round(n * 100) / 100

export interface TileInput {
  pond: PondRow
  /** One per saved day, oldest first, in the current cycle when it is known. */
  samples: { date: string; abw: number }[]
  /** The latest saved scan's CV. */
  cv: number | null
  stockedOn: string | null
  savedToday: boolean
  caretaker: string | null
  mine: boolean
  targetPerKg: number
  today: string
  /** The pond's ยอ, else the farm's default; null when the farm has none. */
  netId: string | null
}

/** Least-squares slope in grams a day; null under two samples. */
export function gramsPerDay(samples: { date: string; abw: number }[]): number | null {
  const pts = samples.slice(-GROWTH_WINDOW)
  if (pts.length < 2) return null
  const first = pts[0]!.date
  const xs = pts.map((p) => daysBetween(first, p.date))
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = pts.reduce((a, p) => a + p.abw, 0) / pts.length
  let num = 0
  let den = 0
  pts.forEach((p, i) => {
    num += (xs[i]! - mx) * (p.abw - my)
    den += (xs[i]! - mx) ** 2
  })
  return den === 0 ? null : round2(num / den)
}

export function tileOf(t: TileInput): PondTile {
  const abw = t.samples.length ? t.samples[t.samples.length - 1]!.abw : null
  const gPerDay = gramsPerDay(t.samples)
  const targetG = 1000 / t.targetPerKg
  let daysToTarget: number | null = null
  if (abw !== null && abw >= targetG) daysToTarget = 0
  else if (abw !== null && gPerDay !== null && gPerDay > 0) daysToTarget = Math.max(0, Math.ceil(round2((targetG - abw) / gPerDay)))

  let status: PondStatus
  let issue: string | null = null
  if (!t.savedToday) {
    status = 'missing'
    issue = 'ยังไม่สแกนวันนี้'
  } else if (gPerDay !== null && gPerDay <= SLOW_G_PER_DAY) {
    status = 'urgent'
    issue = `โตช้ามาก วันละ ${gPerDay.toFixed(2)} ก.`
  } else if (t.cv !== null && t.cv >= UNEVEN_CV) {
    status = 'watch'
    issue = `ไซส์เริ่มไม่เสมอ (CV ${Math.round(t.cv * 100)}%)`
  } else if (daysToTarget !== null && daysToTarget <= READY_DAYS) status = 'ready'
  else status = 'good'

  return {
    id: t.pond.id,
    code: t.pond.code,
    zone: zoneOf(t.pond.code),
    caretaker: t.caretaker,
    perKg: abw !== null ? Math.round(1000 / abw) : null,
    abw,
    gPerDay,
    reachOn: daysToTarget !== null ? addDays(t.today, daysToTarget) : null,
    daysToTarget,
    status,
    photoToday: t.savedToday,
    mine: t.mine,
    issue,
    ageDays: t.stockedOn ? daysBetween(t.stockedOn, t.today) : null,
    netId: t.netId,
  }
}
