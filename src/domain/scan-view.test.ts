import { describe, expect, it } from 'vitest'
import type { Scan } from '../contract/types.js'
import { UNMEASURED, type MemberRow, type ScanRow } from '../data/types.js'
import { ringToPoints } from './rim-geometry.js'
import { foundOf, lengthAtWeight, photoSizeOf, scanFor, shrimpLenPx, shrimpSizes, shrimpWeightG, toScanResult } from './scan-view.js'

describe('shrimpWeightG: the sizing service weight_g, ported from line-bot', () => {
  // line-bot src/scan/shrimp-size.test.ts: values the Python measure.weight_g gives.
  it.each([
    [2.8, 0.1729],
    [6.3, 2.0212],
    [8.0, 4.1357],
    [10.0, 8.072],
    [13.1, 18.132],
  ])('%s cm weighs %s g', (cm, g) => {
    expect(shrimpWeightG(cm)).toBeCloseTo(g, 3)
  })

  it('lengthAtWeight is its inverse', () => {
    for (const g of [0.5, 6, 13.9, 25]) expect(shrimpWeightG(lengthAtWeight(g))).toBeCloseTo(g, 3)
  })
})

describe('shrimpLenPx and shrimpSizes', () => {
  it('lengths go to canvas px at the diameter measured with, and back to cm and grams', () => {
    expect(shrimpLenPx([{ length_cm: 10 }, { length_cm: 5 }], 800, 80)).toEqual([200, 100])
    expect(shrimpSizes({ lenPx: [200, 100], shrimpXy: [0.1, 0.2, 0.3, 0.4], rimRadiusPx: 800, refCm: 80 })).toEqual({
      cm: [10, 5],
      g: [8.07, Math.round(shrimpWeightG(5) * 100) / 100],
    })
  })

  it('no lengths, or lengths that do not pair with the dots, give nothing', () => {
    expect(shrimpLenPx([{ length_cm: 10 }, { length_cm: 0 }], 800, 80)).toBeNull()
    expect(shrimpLenPx([], 800, 80)).toBeNull()
    expect(shrimpSizes({ lenPx: null, shrimpXy: [0.1, 0.2], rimRadiusPx: 800, refCm: 80 })).toBeNull()
    expect(shrimpSizes({ lenPx: [200], shrimpXy: [0.1, 0.2, 0.3, 0.4], rimRadiusPx: 800, refCm: 80 })).toBeNull()
  })
})

// A 1000 x 1000 photo, the rim a circle of 400 px at the centre, flattened onto an 800 px canvas
// with the rim at 400 px: the canvas is the photo moved by (100, 100), so the numbers stay round.
const RING = [0.5, 0.5, 0.4, 0.4, 0]
const measured: ScanRow = {
  id: 's1', farmId: 'f', pondId: 'p1', lineUserId: 'Uowner', status: 'ok', sampleDate: null,
  measuredAt: '2026-10-29T03:00:00.000Z', createdAt: '2026-10-29T02:59:00.000Z',
  abw: 6, perKg: 167, cv: 0.18, n: 2, flags: ['size:1000x1000', 'remeasure'], imageFileId: 'img', netId: 'net-40', rim: RING,
  ...UNMEASURED,
  refCm: 40, rimRadiusPx: 400, canvasPx: 800, shrimpXy: [0.5, 0.5, 1, 0.5], lenPx: [200, 100], abwLo: 5, abwHi: 7,
}

describe('toScanResult: the stored row, so a later read says what the measure said', () => {
  it('sizes, dots on the photo, the rim and what is left', () => {
    const r = toScanResult(measured, { id: 'net-40', cm: 40 }, 1000, 1000, { abw: 5, date: '2026-10-25' })
    expect(r).toMatchObject({ abw: 6, perKg: 167, count: 2, cv: 0.18, lengthCm: 7.5, measuredAt: measured.measuredAt, remeasuresLeft: 2 })
    expect(r.net).toEqual({ id: 'net-40', shape: 'round', cm: 40 })
    expect(r.previous).toEqual({ abw: 5, date: '2026-10-25' })
    expect(r.shrimp).toHaveLength(2)
    expect(r.shrimp[0]!.x).toBeCloseTo(0.5, 6)
    expect(r.shrimp[0]!.y).toBeCloseTo(0.5, 6)
    expect(r.shrimp[1]!.x).toBeCloseTo(0.9, 6)
    expect(r.shrimp[1]!.y).toBeCloseTo(0.5, 6)
    expect(r.shrimp.map((s) => s.g)).toEqual([8.07, Math.round(shrimpWeightG(5) * 100) / 100])
    expect(r.rim).toEqual(ringToPoints(RING, 1000, 1000))
  })

  it('no stored lengths (before migration 210): no invented grams, the length of the average shrimp', () => {
    const r = toScanResult({ ...measured, lenPx: null }, { id: 'net-40', cm: 40 }, 1000, 1000, null)
    expect(r.shrimp).toEqual([])
    expect(r.count).toBe(2)
    expect(r.lengthCm).toBe(Math.round(lengthAtWeight(6) * 10) / 10)
  })

  it('three re-measures used leave none, never fewer', () => {
    const flags = ['size:1000x1000', 'remeasure', 'remeasure', 'remeasure', 'remeasure']
    expect(toScanResult({ ...measured, flags }, { id: 'net-40', cm: 40 }, 1000, 1000, null).remeasuresLeft).toBe(0)
  })
})

describe('foundOf and scanFor: a worker sees the dots and no number', () => {
  it('the dots without sizes, also before 210', () => {
    const noLengths: ScanRow = { ...measured, lenPx: null }
    const dots = foundOf(noLengths, 1000, 1000)!
    expect(dots).toHaveLength(2)
    expect(dots[1]!.x).toBeCloseTo(0.9, 6)
    expect(Object.keys(dots[0]!)).toEqual(['x', 'y'])
    expect(foundOf({ ...measured, shrimpXy: null }, 1000, 1000)).toBeNull()
  })

  it('a worker gets result null, everyone else the result', () => {
    const scan = { id: 's1', result: toScanResult(measured, { id: 'net-40', cm: 40 }, 1000, 1000, null), found: [{ x: 0.5, y: 0.5 }] } as Scan
    const member = (role: MemberRow['role']): MemberRow => ({ id: 'm', farmId: 'f', lineUserId: 'U', role, name: '', pondIds: [], status: 'active' })
    expect(scanFor(member('worker'), scan)).toMatchObject({ result: null, found: [{ x: 0.5, y: 0.5 }] })
    expect(scanFor(member('owner'), scan).result).not.toBeNull()
    expect(scanFor(member('manager'), scan).result).not.toBeNull()
  })

  it('the photo size rides in the flags', () => {
    expect(photoSizeOf(['remeasure', 'size:520x461'])).toEqual({ width: 520, height: 461 })
    expect(photoSizeOf(['note:กินดี'])).toBeNull()
  })
})
