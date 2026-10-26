import { describe, expect, it } from 'vitest'
import { bandCuts, bandOf, distSay, distribution, evenness, isLighter, weightStats } from './sizes'

describe('weightStats', () => {
  it('is all zero for no shrimp', () => {
    expect(weightStats([])).toEqual({ n: 0, mean: 0, cv: 0, min: 0, max: 0 })
  })

  it('computes mean, CV, min and max', () => {
    const s = weightStats([20, 25, 30])
    expect(s.mean).toBe(25)
    expect(s.min).toBe(20)
    expect(s.max).toBe(30)
    expect(s.cv).toBeCloseTo(Math.sqrt(50 / 3) / 25, 9)
  })
})

describe('bands and evenness', () => {
  it('cuts 15% either side of the mean', () => {
    expect(bandCuts(20)).toEqual([17, 23])
    expect(bandOf(16.9, [17, 23])).toBe('s')
    expect(bandOf(17, [17, 23])).toBe('m')
    expect(bandOf(23, [17, 23])).toBe('l')
  })

  it('names evenness by CV', () => {
    expect(evenness(0.08)).toBe('เสมอ')
    expect(evenness(0.15)).toBe('เริ่มไม่เสมอ')
    expect(evenness(0.22)).toBe('ไม่เสมอ')
  })
})

describe('distribution', () => {
  it('puts each shrimp in its ตัว/กก. class and marks the target', () => {
    // 25 g = 40/kg (class 40 to 45), 26 g = 38.5 (35 to 40), 19 g = 52.6 (50 to 60)
    const d = distribution([26, 26, 25, 19], 40)
    expect(d.rows.map((r) => [r.label, r.count, r.kind])).toEqual([
      ['35 ถึง 40', 2, 't'],
      ['40 ถึง 45', 1, 'n'],
      ['50 ถึง 60', 1, 's'],
    ])
    expect(d.reachedPct).toBe(50)
    expect(d.closePct).toBe(25)
  })

  it('adds a target that is not a usual edge', () => {
    // 24 g = 41.7/kg (reached 42), 23 g = 43.5/kg (the class right above it)
    const d = distribution([24, 23], 42)
    expect(d.rows.map((r) => [r.label, r.kind])).toEqual([
      ['40 ถึง 42', 't'],
      ['42 ถึง 45', 'n'],
    ])
  })

  it('says nothing reached yet in plain words', () => {
    const s = distSay(distribution([15, 15.5, 16], 40), 40)
    expect(s.lead).toBeNull()
    expect(s.rest).toContain('ยังไม่มีตัวไหนถึงไซส์ 40')
  })
})

describe('isLighter', () => {
  it('flags only a drop beyond 3%', () => {
    expect(isLighter(13.9, { abw: 15.6 })).toBe(true)
    expect(isLighter(15.2, { abw: 15.6 })).toBe(false)
    expect(isLighter(13.9, null)).toBe(false)
  })
})
