import { describe, expect, it } from 'vitest'
import type { Net } from '@/api/types'
import { netChoiceFrom, netChoiceWants } from './nets'

const net = (id: string, shape: Net['shape'], cm: number): Net => ({ id, shape, cm, use: '', pondCount: 1, addedBy: '', addedOn: '2026-10-20', isFarmDefault: false })
const NETS = [net('r82', 'round', 82), net('r75', 'round', 75), net('s90', 'square', 90)]

describe('the ยอ step (แบบ 2)', () => {
  it('starts from the pond’s ยอ, or from nothing on the farm’s first scan', () => {
    expect(netChoiceFrom(NETS[1]!)).toEqual({ shape: 'round', netId: 'r75', adding: false, typed: '' })
    expect(netChoiceWants(netChoiceFrom(NETS[1]!), NETS)).toEqual({ net: NETS[1] })
    expect(netChoiceWants(netChoiceFrom(null), NETS)).toBeNull()
  })

  it('asks for a size when the farm has none of that shape, and checks it', () => {
    const c = { shape: 'square' as const, netId: null, adding: false, typed: '' }
    expect(netChoiceWants(c, [NETS[0]!])).toBeNull()
    expect(netChoiceWants({ ...c, typed: '12' }, [NETS[0]!])).toBeNull()
    expect(netChoiceWants({ ...c, typed: '88' }, [NETS[0]!])).toEqual({ shape: 'square', cm: 88 })
  })

  it('takes a saved size of the chosen shape only, or a new one being typed', () => {
    expect(netChoiceWants({ shape: 'square', netId: 'r82', adding: false, typed: '' }, NETS)).toBeNull()
    expect(netChoiceWants({ shape: 'round', netId: null, adding: true, typed: '80' }, NETS)).toEqual({ shape: 'round', cm: 80 })
  })
})
