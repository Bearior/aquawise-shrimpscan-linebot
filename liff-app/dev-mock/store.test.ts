import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MockError, Store, imageSize } from './store'
import { FIXED, GUESS, SQ_DOTS, SQ_FIXED, SQ_GUESS } from './story'

const yor = readFileSync(path.join(__dirname, 'fixtures', 'yor.jpg'))
const yorSquare = readFileSync(path.join(__dirname, 'fixtures', 'yor-square.jpg'))

describe('the mock farm', () => {
  it('tells the canvas story on the owner overview', () => {
    const o = new Store().overview('owner')
    expect(o.pondCount).toBe(60)
    expect(o.tiles.ready).toEqual({ n: 5, tonnes: 21.7 })
    expect(o.tiles.urgent).toEqual({ n: 8, slow: 5, missing: 3 })
    expect(o.photosToday).toEqual({ sent: 57, total: 60, missing: ['E03', 'E07', 'F10'] })
    expect(o.soon.rows.map((r) => r.pondCode)).toEqual(['A01', 'A04', 'B02', 'A07', 'A09'])
  })

  it('keeps people to their role', () => {
    const s = new Store()
    expect(s.session('worker').role).toBe('worker')
    expect(s.session('worker').pondIds).toHaveLength(10)
    expect(() => s.overview('worker')).toThrow(MockError)
    expect(() => s.inbox('worker')).toThrow(/not_allowed/)
    expect(s.session('new').candidate?.name).toBe('ฟาร์มบ้านแพ้ว')
    expect(s.session('fresh').farm).toBeNull()
  })

  it('reads the fixture size from the JPEG header', () => {
    expect(imageSize(yor)).toEqual({ width: 520, height: 461 })
    expect(imageSize(Buffer.from('not an image'))).toBeNull()
  })

  it('measures F10 lighter on the wide guess and right on the floor edge (W21 to E5)', () => {
    const s = new Store()
    const { scan } = s.upload('owner', 'p-f10', yor, 'image/jpeg')
    expect(scan.rimGuess).toEqual(GUESS)
    const wide = s.measure('owner', scan.id, GUESS, 'net-82')
    expect(wide.scan.result!.abw).toBe(13.9)
    expect(wide.scan.result!.previous).toEqual({ abw: 15.6, date: '2026-10-15' })
    expect(wide.creditsLeft).toBe(46)

    const fixed = s.measure('owner', scan.id, FIXED, 'net-82')
    expect(fixed.scan.result!.abw).toBe(17.2)
    expect(fixed.creditsLeft).toBe(46) // a re-measure is free
    expect(fixed.scan.result!.remeasuresLeft).toBe(2)
  })

  it('reads a square ยอ by its 4 corners once the pond uses one (แบบ 2)', () => {
    const s = new Store()
    const net = s.addNet('owner', { shape: 'square', cm: 90, pondId: 'p-f10' })
    expect(net.isFarmDefault).toBe(false)
    const { scan } = s.upload('owner', 'p-f10', yorSquare, 'image/jpeg')
    expect(scan.net?.shape).toBe('square')
    expect(scan.rimGuess).toEqual(SQ_GUESS)
    const r = s.measure('owner', scan.id, SQ_FIXED, net.id)
    expect(r.scan.result!.count).toBe(SQ_DOTS.length)
    expect(r.scan.result!.net.shape).toBe('square')
    // 4 corners that make no frame are refused, not measured.
    expect(() => s.measure('owner', scan.id, [SQ_FIXED[0]!, SQ_FIXED[2]!, SQ_FIXED[1]!, { x: 0.5, y: 0.2 }], net.id)).toThrow(/bad_rim/)
  })

  it('saves into the pond and moves the tile', () => {
    const s = new Store()
    const { scan } = s.upload('worker', 'p-f10', yor, 'image/jpeg')
    s.measure('worker', scan.id, FIXED, 'net-82')
    const saved = s.save('worker', scan.id, ['กินดี'])
    expect(saved.chatText).toBe('สแกน F10 แล้ว')
    expect(saved.doneToday).toBe(10) // F01 to F06 scanned, F07 to F09 sent to the owner, F10 now
    const tile = s.ponds('owner').ponds.find((p) => p.code === 'F10')!
    expect(tile.photoToday).toBe(true)
    expect(tile.abw).toBe(17.2)
    expect(s.pondDetail('owner', 'p-f10').note?.text).toBe('กินดี')
  })

  it('counts a photo sent to the owner as done for the worker', () => {
    const t = new Store().today('worker')
    expect(t.done).toBe(9)
    expect(t.rows.filter((r) => r.waiting).map((r) => r.pondCode)).toEqual(['F07', 'F08', 'F09'])
    expect(t.rows.filter((r) => !r.scanId && !r.waiting).map((r) => r.pondCode)).toEqual(['F10'])
  })

  it('checks the ยอ size and makes the first ยอ the farm’s', () => {
    const s = new Store()
    s.start('fresh', { name: 'ฟาร์มทดลอง', ponds: ['A1', 'A2', 'B1'] })
    expect(() => s.addNet('fresh', { shape: 'round', cm: 12 })).toThrow(/net_out_of_range/)
    const n = s.addNet('fresh', { shape: 'round', cm: 80 })
    expect(n.isFarmDefault).toBe(true)
    expect(s.ponds('fresh').zones.map((z) => z.zone)).toEqual(['A', 'B'])
  })

  it('takes an invite once', () => {
    const s = new Store()
    expect(s.invitePreview('new', '7k2p9qx').valid).toBe(true)
    const session = s.acceptInvite('new', '7K2P9QX', { displayName: 'พี่สมชาย', lang: 'th', addFriend: true })
    expect(session.role).toBe('worker')
    expect(session.farm?.name).toBe('ฟาร์มสายน้ำ')
    expect(s.invitePreview('new', '7K2P9QX')).toMatchObject({ valid: false, reason: 'used' })
    expect(() => s.acceptInvite('fresh', '7K2P9QX', { displayName: 'x', lang: 'th', addFriend: false })).toThrow(/invite_invalid/)
  })
})
