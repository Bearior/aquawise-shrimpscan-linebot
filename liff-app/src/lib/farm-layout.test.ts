import { describe, expect, it } from 'vitest'
import { nextCodes, nextZoneLetter, pondNameProblem, zoneLabel, zoneOf } from './farm-layout'

describe('farm layout', () => {
  it('files a pond under its leading letters, numbers alone under 1', () => {
    expect(zoneOf('A01')).toBe('A')
    expect(zoneOf('ab3')).toBe('AB')
    expect(zoneOf('07')).toBe('1')
  })

  it('reads a zone by its name, else by its letter', () => {
    expect(zoneLabel('A', 'หน้าบ้าน')).toBe('หน้าบ้าน')
    expect(zoneLabel('A', '  ')).toBe('โซน A')
    expect(zoneLabel('B', null)).toBe('โซน B')
  })

  it('counts on from the highest number in the zone, skipping taken names', () => {
    expect(nextCodes('A', ['A01', 'A02', 'A10', 'B11'], 2)).toEqual(['A11', 'A12'])
    expect(nextCodes('A', ['A01', 'A03หน้าบ้าน', 'A02'], 1)).toEqual(['A03'])
    expect(nextCodes('C', ['A01'], 3)).toEqual(['C01', 'C02', 'C03'])
    expect(nextCodes('1', ['01', '02', 'A01'], 2)).toEqual(['03', '04'])
    expect(nextCodes('A', ['A01', 'a02'], 1)).toEqual(['A03'])
  })

  it('takes the first letter no zone uses', () => {
    expect(nextZoneLetter(['A', 'B', 'D'])).toBe('C')
    expect(nextZoneLetter('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))).toBeNull()
  })

  it('keeps a renamed pond in its zone and its name free', () => {
    const taken = (c: string) => ['A01', 'A02'].includes(c.toUpperCase())
    expect(pondNameProblem('A', '03', taken)).toBeNull()
    expect(pondNameProblem('A', 'หน้าบ้าน', taken)).toBeNull()
    expect(pondNameProblem('A', 'B1', taken)).toMatch(/ต่อจาก A/)
    expect(pondNameProblem('A', '02', taken)).toMatch(/มีบ่อชื่อ A02/)
    expect(pondNameProblem('1', 'A1', taken)).toMatch(/ขึ้นต้น/)
  })
})
