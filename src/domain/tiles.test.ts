import { describe, expect, it } from 'vitest'
import type { PondRow } from '../data/types.js'
import { addDays } from './farm.js'
import { tileOf, type TileInput } from './tiles.js'

const TODAY = '2026-10-29'
const pond: PondRow = { id: 'p1', farmId: 'f1', code: 'A01', netId: null }

function input(over: Partial<TileInput>): TileInput {
  return {
    pond,
    samples: [],
    cv: null,
    stockedOn: null,
    savedToday: true,
    caretaker: null,
    mine: false,
    targetPerKg: 40,
    today: TODAY,
    netId: null,
    ...over,
  }
}

/** One sample a day, the last one today. */
const daily = (...abw: number[]) => abw.map((g, i) => ({ date: addDays(TODAY, i - abw.length + 1), abw: g }))

describe('tileOf', () => {
  it('a pond never scanned and not scanned today is missing, with no numbers', () => {
    const t = tileOf(input({ savedToday: false }))
    expect(t).toMatchObject({
      id: 'p1', code: 'A01', zone: 'A', status: 'missing', photoToday: false, issue: 'ยังไม่สแกนวันนี้',
      abw: null, perKg: null, gPerDay: null, reachOn: null, daysToTarget: null, ageDays: null,
    })
  })

  it('reads growth, size and the day it reaches the target', () => {
    const t = tileOf(input({ samples: daily(10.0, 10.8, 11.6), targetPerKg: 70 }))
    expect(t.gPerDay).toBe(0.8)
    expect(t.abw).toBe(11.6)
    expect(t.perKg).toBe(86)
    expect(t.daysToTarget).toBe(4)
    expect(t.reachOn).toBe(addDays(TODAY, 4))
    expect(t.status).toBe('ready')
    expect(t.issue).toBeNull()
    expect(t.photoToday).toBe(true)
  })

  it('a pond growing 0.15 g a day is urgent, in the mock wording', () => {
    const t = tileOf(input({ samples: daily(10.0, 10.15, 10.3) }))
    expect(t.gPerDay).toBe(0.15)
    expect(t.status).toBe('urgent')
    expect(t.issue).toBe('โตช้ามาก วันละ 0.15 ก.')
  })

  it('uneven sizes (CV 15%) are watch', () => {
    const t = tileOf(input({ samples: daily(10.0, 10.3, 10.6), cv: 0.15 }))
    expect(t.status).toBe('watch')
    expect(t.issue).toBe('ไซส์เริ่มไม่เสมอ (CV 15%)')
  })

  it('a pond growing well, far from the target, is good', () => {
    const t = tileOf(input({ samples: daily(10.0, 10.3, 10.6), cv: 0.1 }))
    expect(t.status).toBe('good')
    expect(t.daysToTarget).toBe(48)
    expect(t.issue).toBeNull()
  })

  it('growth is the slope of the last 4 samples only', () => {
    const t = tileOf(input({ samples: [{ date: addDays(TODAY, -10), abw: 1 }, ...daily(10.0, 10.3, 10.6, 10.9)] }))
    expect(t.gPerDay).toBe(0.3)
  })

  it('one sample gives a size but no growth or date', () => {
    const t = tileOf(input({ samples: daily(12.5) }))
    expect(t).toMatchObject({ abw: 12.5, perKg: 80, gPerDay: null, daysToTarget: null, reachOn: null, status: 'good' })
  })

  it('a pond already past the target reaches it today', () => {
    const t = tileOf(input({ samples: daily(26, 26.3) }))
    expect(t.daysToTarget).toBe(0)
    expect(t.reachOn).toBe(TODAY)
    expect(t.status).toBe('ready')
  })

  it('not scanned today is missing even with older numbers, which it keeps', () => {
    const t = tileOf(input({ samples: daily(10.0, 10.3).map((s) => ({ ...s, date: addDays(s.date, -1) })), savedToday: false }))
    expect(t.status).toBe('missing')
    expect(t.abw).toBe(10.3)
  })

  it('carries age, caretaker, mine and the ยอ', () => {
    const t = tileOf(input({ stockedOn: addDays(TODAY, -40), caretaker: 'น้องเอ', mine: true, netId: 'net-1' }))
    expect(t).toMatchObject({ ageDays: 40, caretaker: 'น้องเอ', mine: true, netId: 'net-1' })
  })
})
