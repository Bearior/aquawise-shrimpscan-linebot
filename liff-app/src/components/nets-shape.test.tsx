import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Net } from '@/api/types'
import { NET_SHAPES, SQUARE_NET_ENABLED } from '@/lib/rim'
import { NetNewSheet, NetStep, netChoiceFrom } from './nets'

afterEach(cleanup)

const net: Net = { id: 'r82', shape: 'round', cm: 82, use: 'ยอของฟาร์ม', pondCount: 3, addedBy: '', addedOn: '2026-10-20', isFarmDefault: true }

describe('the square ยอ is held back (the shared database has no ยอ shape yet)', () => {
  it('only ยอกลม can be chosen', () => {
    expect(SQUARE_NET_ENABLED).toBe(false)
    expect(NET_SHAPES).toEqual(['round'])
  })

  it('the farm’s first scan starts on ยอกลม, so the size field is there at once', () => {
    expect(netChoiceFrom(null)).toEqual({ shape: 'round', netId: null, adding: false, typed: '' })
  })

  it('the ยอ step shows no ยอสี่เหลี่ยม card', () => {
    render(<NetStep pondCode="E01" nets={[net]} pondNet={net} choice={netChoiceFrom(net)} onChoice={() => {}} />)
    const shapes = within(screen.getByRole('radiogroup', { name: 'รูปทรงยอ' })).getAllByRole('radio')
    expect(shapes).toHaveLength(1)
    expect(shapes[0]!.textContent).toContain('ยอกลม')
    expect(screen.queryByText(/ยอสี่เหลี่ยม/)).toBeNull()
  })

  it('the new ยอ sheet shows no ยอสี่เหลี่ยม chip', () => {
    render(<NetNewSheet title="ยอใหม่" after="" onDone={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('ยอกลม')).toBeTruthy()
    expect(screen.queryByText(/ยอสี่เหลี่ยม/)).toBeNull()
  })
})
