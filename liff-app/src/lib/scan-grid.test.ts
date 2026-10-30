import { describe, expect, it } from 'vitest'
import { CELL, DAY_GUTTER, MONTH_BAND, STEP, buildScanGrid, levelFor } from './scan-grid'

describe('levelFor', () => {
  it('reads the share of the farm scanned that day', () => {
    expect([0, 1, 29, 30, 47, 48, 59, 60, 61].map((n) => levelFor(n, 60))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
    expect(levelFor(3, 0)).toBe(0)
  })
})

describe('buildScanGrid', () => {
  // 2026-10-20 is a Tuesday.
  const g = buildScanGrid([{ date: '2026-10-20', done: 60 }, { date: '2026-10-19', done: 30 }, { date: '2026-01-01', done: 60 }], 60, '2026-10-20')!

  it('13 Monday-first columns ending on the day, nothing after it', () => {
    expect(g.width).toBe(DAY_GUTTER + 13 * STEP - 3)
    expect(g.cells[0]!.date).toBe('2026-07-27')
    expect(g.cells[0]!.y).toBe(MONTH_BAND)
    const last = g.cells[g.cells.length - 1]!
    expect(last).toMatchObject({ date: '2026-10-20', done: 60, level: 4, x: DAY_GUTTER + 12 * STEP, y: MONTH_BAND + STEP })
    expect(g.cells.find((c) => c.date === '2026-10-19')).toMatchObject({ level: 2, y: MONTH_BAND })
    expect(g.cells).toHaveLength(12 * 7 + 2)
  })

  it('names a month at the column of its 1st only', () => {
    expect(g.months.map((m) => m.text)).toEqual(['ส.ค.', 'ก.ย.', 'ต.ค.'])
    // 1 Aug is the Saturday of the first week; 1 Oct the Thursday of week 10.
    expect(g.months.map((m) => m.x)).toEqual([DAY_GUTTER, DAY_GUTTER + 5 * STEP, DAY_GUTTER + 9 * STEP])
  })

  it('places the day labels on the rows they name', () => {
    expect(g.days.map((d) => [d.text, d.y])).toEqual([
      ['จ.', MONTH_BAND + CELL / 2],
      ['พ.', MONTH_BAND + 2 * STEP + CELL / 2],
      ['ศ.', MONTH_BAND + 4 * STEP + CELL / 2],
    ])
  })

  it('no grid for a day that is not a date', () => {
    expect(buildScanGrid([], 60, 'today')).toBeNull()
  })
})
