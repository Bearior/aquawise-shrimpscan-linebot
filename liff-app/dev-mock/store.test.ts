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
    expect(o.photosToday).toMatchObject({ sent: 57, total: 60, missing: ['E03', 'E07', 'F10'], remindAt: '10:00' })
    expect(o.photosToday.zones.map((z) => [z.zone, z.name, z.done, z.total])).toEqual([
      ['A', 'หน้าบ้าน', 10, 10],
      ['B', null, 10, 10],
      ['C', 'ริมคลอง', 10, 10],
      ['D', null, 10, 10],
      ['E', null, 8, 10],
      ['F', null, 9, 10],
    ])
    expect(o.soon.rows.map((r) => r.pondCode)).toEqual(['A01', 'A04', 'B02', 'A07', 'A09'])
  })

  it('keeps people to their role', () => {
    const s = new Store()
    expect(s.session('worker').role).toBe('worker')
    expect(s.session('worker').pondIds).toHaveLength(10)
    expect(() => s.overview('worker')).toThrow(MockError)
    expect(() => s.inbox('worker')).toThrow(/not_allowed/)
    expect(s.session('worker').permissions).toMatchObject({ farmOverview: false, printSheet: false })
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
    expect(saved.doneToday).toBe(10) // F01 to F09 scanned this morning, F10 now
    expect(saved.reachOn).toBeNull() // a worker gets no growth back
    const tile = s.ponds('owner').ponds.find((p) => p.code === 'F10')!
    expect(tile.photoToday).toBe(true)
    expect(tile.abw).toBe(17.2)
    expect(s.pondDetail('owner', 'p-f10').note?.text).toBe('กินดี')
    expect(s.teamToday('owner').people.find((x) => x.name === 'ช่างเอก')).toMatchObject({ done: 10, total: 10 })
  })

  it('gives a worker their ponds for today and no sizes', () => {
    const s = new Store()
    const t = s.today('worker')
    expect(t).toMatchObject({ done: 9, total: 10 })
    expect(t.rows.filter((r) => !r.scanId).map((r) => r.pondCode)).toEqual(['F10'])
    expect(Object.keys(t.rows[0]!)).not.toContain('perKg')

    const { scan } = s.upload('worker', 'p-f10', yor, 'image/jpeg')
    const m = s.measure('worker', scan.id, FIXED, 'net-82')
    expect(m.scan.result).toBeNull()
    expect(m.scan.found).toHaveLength(64)
    expect(m.scan.canFix).toBe(false)
    expect(s.measure('owner', scan.id, FIXED, 'net-82').scan.result?.abw).toBe(17.2)

    for (const call of [() => s.ponds('worker'), () => s.pondDetail('worker', 'p-f10'), () => s.pondScans('worker', 'p-f10'), () => s.teamToday('worker')]) {
      expect(call).toThrow(/not_allowed/)
    }
    // Not their pond: a worker scans only what the owner gave them.
    expect(() => s.upload('worker', 'p-a01', yor, 'image/jpeg')).toThrow(/not_allowed/)
  })

  it('holds the size-showing switches off for a worker, whatever is stored', () => {
    const s = new Store()
    s.patchPermissions('owner', 'm-ek', { key: 'farmOverview', value: true })
    expect(s.session('worker').permissions.farmOverview).toBe(false)
    expect(() => s.overview('worker')).toThrow(/not_allowed/)
  })

  it('shows the owner who scanned today, the ones with ponds left first', () => {
    const t = new Store().teamToday('owner')
    expect(t).toMatchObject({ done: 57, total: 60, remindAt: '10:00', nobody: [] })
    expect(t.people.map((x) => [x.name, x.done, x.total])).toEqual([
      ['บังดล', 8, 10],
      ['ช่างเอก', 9, 10],
      ['น้าศักดิ์', 20, 20],
      ['ลุงพล', 10, 10],
      ['พี่ชาติ', 10, 10],
    ])
    expect(t.people[0]!.ponds.filter((p) => !p.at).map((p) => p.pondCode)).toEqual(['E03', 'E07'])
  })

  it('lists เรื่องน่าจับตา, today first, and keeps a รับทราบ only while the fact holds', () => {
    const s = new Store()
    const owner = s.session('owner').user.name
    const item = (key: string) => s.overview('owner').watch.find((w) => w.key === key)!
    expect(s.overview('owner').watch.map((w) => w.key)).toEqual(['harvest-A01', 'missing', 'harvest-A04', 'harvest-B02', 'slow'])
    expect(item('missing')).toMatchObject({ ackable: false, action: { to: 'team' }, detail: '**E03 · E07 · F10** · บังดล กับช่างเอก ดูแลอยู่' })
    expect(() => s.ackWatch('owner', 'missing', item('missing').signature)).toThrow(/not_found/)

    expect(s.ackWatch('owner', 'slow', item('slow').signature).by).toBe(owner)
    expect(item('slow').acked).toMatchObject({ by: owner })
    // Acked against an older version of the fact: it stays open.
    s.ackWatch('owner', 'harvest-A01', '2026-10-19:40')
    expect(item('harvest-A01').acked).toBeNull()
    s.unackWatch('owner', 'slow')
    expect(item('slow').acked).toBeNull()
    expect(() => s.ackWatch('worker', 'slow', item('slow').signature)).toThrow(MockError)
  })

  it('gives a pond one caretaker: moving it leaves the old one', () => {
    const s = new Store()
    const all = s.memberPonds('owner', 'm-ek')
    const a01 = all.ponds.find((p) => p.code === 'A01')!
    expect(a01.heldBy).toBe('ลุงพล')
    const after = s.setMemberPonds('owner', 'm-ek', [...all.pondIds, a01.id])
    expect(after.pondIds).toHaveLength(11)
    expect(s.memberPonds('owner', 'm-phon').pondIds).toHaveLength(9)
    expect(s.today('worker').total).toBe(11)
    expect(() => s.setMemberPonds('worker', 'm-ek', [])).toThrow(/not_allowed/)
  })

  it('checks the ยอ size and makes the first ยอ the farm’s', () => {
    const s = new Store()
    s.start('fresh', { name: 'ฟาร์มทดลอง', ponds: ['A1', 'A2', 'B1'] })
    expect(() => s.addNet('fresh', { shape: 'round', cm: 12 })).toThrow(/net_out_of_range/)
    const n = s.addNet('fresh', { shape: 'round', cm: 80 })
    expect(n.isFarmDefault).toBe(true)
    expect(s.ponds('fresh').zones.map((z) => z.zone)).toEqual(['A', 'B'])
  })

  it('lets the owner name zones, add ponds and zones, and rename a pond inside its zone', () => {
    const s = new Store()
    s.setZoneName('owner', 'b', ' ริมถนน ')
    expect(s.ponds('owner').zones.find((z) => z.zone === 'B')?.name).toBe('ริมถนน')
    s.setZoneName('owner', 'B', '')
    expect(s.ponds('owner').zones.find((z) => z.zone === 'B')?.name).toBeNull()
    const made = s.addPonds('owner', ['A11', 'G01', 'G02'])
    expect(made.ponds.map((p) => p.code)).toEqual(['A11', 'G01', 'G02'])
    expect(s.session('owner').farm?.pondCount).toBe(63)
    expect(s.ponds('owner').zones.map((z) => z.zone)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    expect(() => s.addPonds('owner', ['a01'])).toThrow(/name_taken/)
    const a02 = s.ponds('owner').ponds.find((p) => p.code === 'A02')!
    s.renamePond('owner', a02.id, 'A02หน้า')
    expect(s.ponds('owner').ponds.some((p) => p.code === 'A02หน้า')).toBe(true)
    expect(() => s.renamePond('owner', a02.id, 'B99')).toThrow(MockError)
    expect(() => s.renamePond('owner', a02.id, 'A01')).toThrow(/name_taken/)
    expect(() => s.addPonds('manager', ['A12'])).toThrow(/not_allowed/)
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
