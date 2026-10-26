import { describe, expect, it } from 'vitest'
import {
  addDays,
  bangkokDay,
  daysBetween,
  fmtDay,
  fmtDayYear,
  fmtInt,
  fmtQueueDay,
  fmtTime,
  fmtTonnes,
  fmtWeekday,
  fmtWeekdayShort,
  fmtWeekdayYear,
  fmtWhen,
  pondRange,
} from './format'

describe('Thai dates', () => {
  it('formats days, weekdays and the Buddhist year', () => {
    expect(fmtDay('2026-10-20')).toBe('20 ต.ค.')
    expect(fmtDayYear('2026-10-20')).toBe('20 ต.ค. 2569')
    expect(fmtWeekday('2026-10-20')).toBe('อังคาร 20 ต.ค.')
    expect(fmtWeekdayYear('2026-10-20')).toBe('อังคาร 20 ต.ค. 2569')
    expect(fmtWeekdayShort('2026-10-22')).toBe('พฤ. 22 ต.ค.')
    expect(fmtQueueDay('2026-10-20', '2026-10-20')).toBe('วันนี้')
  })

  it('reads instants in Bangkok time', () => {
    // 23:30 UTC on the 19th is 06:30 on the 20th in Bangkok.
    expect(fmtTime('2026-10-19T23:30:00.000Z')).toBe('06:30')
    expect(bangkokDay('2026-10-19T23:30:00.000Z')).toBe('2026-10-20')
    expect(fmtWhen('2026-10-19T23:30:00.000Z', '2026-10-20')).toBe('วันนี้ 06:30')
    expect(fmtWhen('2026-10-19T10:12:00.000Z', '2026-10-20')).toBe('เมื่อวาน 17:12')
    expect(fmtWhen('2026-10-14T23:30:00.000Z', '2026-10-20')).toBe('15 ต.ค. 06:30')
  })

  it('does day arithmetic across months', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
    expect(daysBetween('2026-10-20', '2026-11-02')).toBe(13)
  })
})

describe('numbers', () => {
  it('uses Latin digits whatever the device locale', () => {
    expect(fmtInt(220000)).toBe('220,000')
    expect(fmtTonnes(4.04)).toBe('4.0')
    expect(fmtTonnes(158.6)).toBe('159')
  })

  it('names a run of ponds', () => {
    expect(pondRange([])).toBe('')
    expect(pondRange(['A04'])).toBe('A04')
    expect(pondRange(['F01', 'F02', 'F10'])).toBe('F01 ถึง F10')
  })
})
