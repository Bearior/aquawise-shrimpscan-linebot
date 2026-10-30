import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { createMemoryRepos, type MemoryRepos, type MemoryState } from '../../data/memory.js'
import { UNMEASURED, type FarmRow, type MemberRow, type NetRow, type PondRow, type ScanRow } from '../../data/types.js'
import { addDays, bangkokDay } from '../../domain/farm.js'
import { REMIND_AT } from '../../domain/settings.js'

const KEYS = ['ALLOW_DEV_LIFF_AUTH', 'LIFF_DEV_USER_ID', 'K_SERVICE', 'NODE_ENV', 'SUPABASE_URL'] as const
const saved: Record<string, string | undefined> = {}
for (const k of KEYS) saved[k] = process.env[k]
beforeEach(() => {
  for (const k of KEYS) delete process.env[k]
  process.env.ALLOW_DEV_LIFF_AUTH = 'true'
})
afterEach(() => {
  for (const k of KEYS) {
    const v = saved[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

const OWNER = 'Uowner'
const WORKER = 'Uworker'
const MANAGER = 'Umanager'
const TODAY = bangkokDay()

function as(who: string, repos: MemoryRepos) {
  process.env.LIFF_DEV_USER_ID = who
  const app = createApp({ repos })
  const auth = { authorization: 'Bearer dev-liff' }
  return {
    get: (p: string) => request(app).get(`/api/liff${p}`).set(auth),
    post: (p: string, body: unknown) => request(app).post(`/api/liff${p}`).set(auth).send(body as object),
    put: (p: string, body: unknown) => request(app).put(`/api/liff${p}`).set(auth).send(body as object),
    patch: (p: string, body: unknown) => request(app).patch(`/api/liff${p}`).set(auth).send(body as object),
    del: (p: string) => request(app).delete(`/api/liff${p}`).set(auth),
  }
}

const farm: FarmRow = { id: 'farm-oa', name: 'ฟาร์มสายน้ำ', createdBy: OWNER, createdVia: 'shrimp_scan_oa', accessLevel: 'scan_only' }
const owner: MemberRow = { id: 'm-owner', farmId: farm.id, lineUserId: OWNER, role: 'owner', name: 'พี่วิชัย', pondIds: [], status: 'active' }
const worker: MemberRow = { id: 'm-worker', farmId: farm.id, lineUserId: WORKER, role: 'worker', name: 'น้องเอ', pondIds: ['p1', 'p2'], status: 'active' }
const manager: MemberRow = { id: 'm-manager', farmId: farm.id, lineUserId: MANAGER, role: 'manager', name: 'พี่บี', pondIds: ['p3'], status: 'active' }
const ponds: PondRow[] = [
  { id: 'p1', farmId: farm.id, code: 'A01', netId: null },
  { id: 'p2', farmId: farm.id, code: 'A02', netId: null },
  { id: 'p3', farmId: farm.id, code: 'B01', netId: null },
]
const nets: NetRow[] = [{ id: 'net-farm', farmId: farm.id, cm: 82, createdBy: OWNER, createdAt: '2026-09-01T00:00:00Z', archivedAt: null }]

function scan(id: string, pondId: string, day: string, abw: number, over: Partial<ScanRow> = {}): ScanRow {
  return {
    id, farmId: farm.id, pondId, lineUserId: WORKER, status: 'ok', sampleDate: day,
    measuredAt: `${day}T01:00:00.000Z`, createdAt: `${day}T00:59:00.000Z`,
    abw, perKg: Math.round(1000 / abw), cv: 0.1, n: 60, flags: [], imageFileId: `img-${id}`, netId: null, rim: null, ...UNMEASURED, ...over,
  }
}

/**
 * Target 40/kg is 25 g. A01 grows 1 g a day to 22 g today: 3 days out, ready.
 * A02 was not scanned today. B01 grows 0.1 g a day: slow, urgent.
 */
function seeded(extra: Partial<MemoryState> = {}): MemoryRepos {
  return createMemoryRepos({
    farms: [farm],
    members: [owner, worker, manager],
    ponds,
    nets,
    scans: [
      scan('a1', 'p1', addDays(TODAY, -2), 20),
      scan('a2', 'p1', addDays(TODAY, -1), 21),
      scan('a3', 'p1', TODAY, 22),
      scan('b1', 'p2', addDays(TODAY, -2), 10),
      scan('b2', 'p2', addDays(TODAY, -1), 11),
      scan('c1', 'p3', addDays(TODAY, -2), 10, { lineUserId: MANAGER }),
      scan('c2', 'p3', addDays(TODAY, -1), 10.1, { lineUserId: MANAGER }),
      scan('c3', 'p3', TODAY, 10.2, { lineUserId: MANAGER }),
    ],
    cycles: [{ id: 'c-1', pondId: 'p1', farmId: farm.id, stockedOn: addDays(TODAY, -60), count: 100_000, survival: 0.8, open: true }],
    ...extra,
  })
}

describe('GET /overview', () => {
  it('gives the groups, today’s scans, the queue and เรื่องน่าจับตา in order', async () => {
    const res = await as(OWNER, seeded()).get('/overview')
    expect(res.status).toBe(200)
    const o = res.body
    expect(o).toMatchObject({ farmName: 'ฟาร์มสายน้ำ', today: TODAY, pondCount: 3, targetPerKg: 40 })
    expect(o.tiles).toEqual({ ready: { n: 1, tonnes: 2 }, good: { n: 0 }, watch: { n: 0 }, urgent: { n: 2, slow: 1, missing: 1 } })
    expect(o.photosToday).toEqual({
      sent: 2,
      total: 3,
      missing: ['A02'],
      zones: [
        { zone: 'A', name: null, done: 1, total: 2 },
        { zone: 'B', name: null, done: 1, total: 1 },
      ],
      remindAt: REMIND_AT,
    })
    expect(o.soon.rows).toEqual([{ pondId: 'p1', pondCode: 'A01', date: addDays(TODAY, 3), perKg: 45, abw: 22, tonnes: 2 }])
    expect(o.queueDays).toHaveLength(14)
    expect(o.queueDays[3]).toEqual({ date: addDays(TODAY, 3), n: 1 })
    expect(o.watch.map((w: { key: string }) => w.key)).toEqual(['missing', 'harvest-A01', 'slow'])
    const [missing, harvest, slow] = o.watch
    expect(missing).toMatchObject({ ackable: false, auto: 'หายไปเองเมื่อสแกนแล้วค่ะ', detail: '**A02** · น้องเอ ดูแลอยู่', acked: null })
    expect(harvest).toMatchObject({ chip: 'อีก 3 วัน', tone: 'plain', ackable: true, action: { to: 'pond', pondId: 'p1' } })
    expect(harvest.detail).toContain('ราว **2 ตัน**')
    expect(harvest.detail).toContain('น้องเอ ดูแลโซน A')
    expect(slow).toMatchObject({ title: '1 บ่อโตช้าหรือแตกไซส์', signature: 'B01', ackable: true })
  })

  it('a worker never sees it (no numbers): 403 not_allowed', async () => {
    const res = await as(WORKER, seeded()).get('/overview')
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'not_allowed' })
  })

  it('a manager the owner took farmOverview from is refused, and the session says so', async () => {
    const repos = seeded()
    const off = await as(OWNER, repos).patch('/members/m-manager/permissions', { key: 'farmOverview', value: false })
    expect(off.status).toBe(200)
    expect((await as(MANAGER, repos).get('/overview')).status).toBe(403)
    expect((await as(MANAGER, repos).get('/team/today')).status).toBe(403)
    expect((await as(MANAGER, repos).get('/session')).body.permissions.farmOverview).toBe(false)
  })
})

describe('PUT|DELETE /watch/:key/ack', () => {
  it('รับทราบ holds farm-wide while the signature matches, and can be taken back', async () => {
    const repos = seeded()
    const put = await as(MANAGER, repos).put('/watch/slow/ack', { signature: 'B01' })
    expect(put.status).toBe(200)
    expect(put.body.by).toBe('พี่บี')
    expect(put.body.at).toMatch(/^\d{2}:\d{2}$/)
    const seen = (await as(OWNER, repos).get('/overview')).body.watch.find((w: { key: string }) => w.key === 'slow')
    expect(seen.acked).toEqual(put.body)

    await as(OWNER, repos).del('/watch/slow/ack').expect(204)
    const gone = (await as(OWNER, repos).get('/overview')).body.watch.find((w: { key: string }) => w.key === 'slow')
    expect(gone.acked).toBeNull()
  })

  it('an old รับทราบ never hides a new fact', async () => {
    const repos = seeded()
    await as(OWNER, repos).put('/watch/slow/ack', { signature: 'B01 · A02' }).expect(200)
    const seen = (await as(OWNER, repos).get('/overview')).body.watch.find((w: { key: string }) => w.key === 'slow')
    expect(seen.acked).toBeNull()
  })

  it('an item that leaves by being done, or is not there, is 404; no signature is 400; a worker 403', async () => {
    const repos = seeded()
    expect((await as(OWNER, repos).put('/watch/missing/ack', { signature: 'A02' })).status).toBe(404)
    expect((await as(OWNER, repos).put('/watch/harvest-Z99/ack', { signature: 'x' })).status).toBe(404)
    expect((await as(OWNER, repos).put('/watch/slow/ack', {})).status).toBe(400)
    expect((await as(WORKER, repos).put('/watch/slow/ack', { signature: 'B01' })).status).toBe(403)
    expect(repos.state.settings[farm.id]).toBeUndefined()
  })
})

describe('GET /today', () => {
  it('a worker gets their own ponds, who scanned, and no size', async () => {
    const res = await as(WORKER, seeded()).get('/today')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      done: 1,
      total: 2,
      rows: [
        { pondId: 'p1', pondCode: 'A01', netId: 'net-farm', scanId: 'a3', by: 'น้องเอ', at: `${TODAY}T01:00:00.000Z`, photoUrl: 'https://photos.test/img-a3' },
        { pondId: 'p2', pondCode: 'A02', netId: 'net-farm', scanId: null, by: null, at: null, photoUrl: null },
      ],
    })
  })

  it('the owner’s list is every pond', async () => {
    const res = await as(OWNER, seeded()).get('/today')
    expect(res.body).toMatchObject({ done: 2, total: 3 })
  })
})

describe('GET /team/today', () => {
  it('everyone who looks after ponds, the ones with ponds left first', async () => {
    const res = await as(OWNER, seeded()).get('/team/today')
    expect(res.status).toBe(200)
    const t = res.body
    expect(t).toMatchObject({ today: TODAY, done: 2, total: 3, nobody: [], remindAt: '10:00' })
    expect(t.people.map((p: { name: string; done: number; total: number }) => [p.name, p.done, p.total])).toEqual([
      ['น้องเอ', 1, 2],
      ['พี่บี', 1, 1],
    ])
    expect(t.people[0]).toMatchObject({ memberId: 'm-worker', role: 'worker', pondsLabel: 'A01 ถึง A02', lastAt: `${TODAY}T01:00:00.000Z` })
  })

  it('the grid: ponds scanned each day of the last 13 weeks, oldest first, a pond once a day', async () => {
    const repos = seeded()
    repos.state.scans.push(scan('a0', 'p1', TODAY, 22.1), scan('old', 'p1', addDays(TODAY, -200), 5))
    const t = (await as(OWNER, repos).get('/team/today')).body
    expect(t.history).toEqual([
      { date: addDays(TODAY, -2), done: 3 },
      { date: addDays(TODAY, -1), done: 3 },
      { date: TODAY, done: 2 },
    ])
  })

  it('a pond nobody looks after is listed apart; the reminder line follows the switch', async () => {
    const repos = seeded({ members: [owner, worker] })
    await as(OWNER, repos).patch('/settings', { notify: { remindWorkers: false } }).expect(200)
    const t = (await as(OWNER, repos).get('/team/today')).body
    expect(t.nobody).toEqual([{ pondId: 'p3', pondCode: 'B01', at: `${TODAY}T01:00:00.000Z`, by: 'คนในฟาร์ม' }])
    expect(t.remindAt).toBeNull()
  })
})

describe('settings', () => {
  it('anyone reads them; only an owner or manager changes them; a stray key is 400', async () => {
    const repos = seeded()
    const got = await as(WORKER, repos).get('/settings')
    expect(got.status).toBe(200)
    expect(got.body).toEqual({
      notify: { photoIn: true, morningSummary: true, morningSheet: false, nearTarget: true, remindWorkers: true },
      nets: { count: 1, sizes: [82] },
    })
    expect((await as(WORKER, repos).patch('/settings', { notify: { photoIn: false } })).status).toBe(403)
    expect((await as(OWNER, repos).patch('/settings', { notify: { bogus: true } })).status).toBe(400)
    expect((await as(OWNER, repos).patch('/settings', { notify: { photoIn: 'no' } })).status).toBe(400)
    const saved = await as(MANAGER, repos).patch('/settings', { notify: { morningSheet: true } })
    expect(saved.body.notify).toMatchObject({ morningSheet: true, photoIn: true })
  })

  it('a switch saved keeps the รับทราบ and the people’s switches beside it', async () => {
    const repos = seeded()
    await as(OWNER, repos).put('/watch/slow/ack', { signature: 'B01' }).expect(200)
    await as(OWNER, repos).patch('/settings', { notify: { photoIn: false } }).expect(200)
    const stored = repos.state.settings[farm.id] as { photoIn: boolean; acks: Record<string, unknown> }
    expect(stored.photoIn).toBe(false)
    expect(Object.keys(stored.acks)).toEqual(['slow'])
  })
})

describe('print', () => {
  it('the farm sheet: the queue with caretakers, the ponds to look at, the zones', async () => {
    const res = await as(OWNER, seeded()).get('/print/farm')
    expect(res.status).toBe(200)
    const s = res.body
    expect(s).toMatchObject({ farmName: 'ฟาร์มสายน้ำ', date: TODAY, targetPerKg: 40, photosToday: { sent: 2, total: 3 } })
    // A02 (11 g, 1 g a day) reaches 25 g in 14 days: the later list, with no tonnes while its stocking is unknown.
    expect(s.queue).toEqual([
      { pondId: 'p1', pondCode: 'A01', date: addDays(TODAY, 3), perKg: 45, abw: 22, tonnes: 2, soon: true, caretaker: 'น้องเอ' },
      { pondId: 'p2', pondCode: 'A02', date: addDays(TODAY, 14), perKg: 91, abw: 11, tonnes: 0, soon: false, caretaker: 'น้องเอ' },
    ])
    expect(s.watch.map((w: { pondCode: string; kind: string }) => [w.pondCode, w.kind])).toEqual([
      ['B01', 'urgent'],
      ['A02', 'missing'],
    ])
    expect(s.zones.map((z: { zone: string }) => z.zone)).toEqual(['A', 'B'])
  })

  it('the pond sheet needs a measured photo with its size; a worker gets neither sheet', async () => {
    const repos = seeded()
    expect((await as(OWNER, repos).get('/print/pond/p1')).status).toBe(404)
    Object.assign(repos.state.scans.find((s) => s.id === 'a3')!, { flags: ['size:520x461'], refCm: 82, netId: 'net-farm' })
    const res = await as(OWNER, repos).get('/print/pond/p1')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ farmName: 'ฟาร์มสายน้ำ', photoWidth: 520, photoHeight: 461, targetPerKg: 40 })
    expect(res.body.scan.scanId).toBe('a3')
    expect(res.body.result).toMatchObject({ abw: 22, net: { id: 'net-farm', cm: 82 }, previous: { abw: 21, date: addDays(TODAY, -1) } })
    expect(res.body.growth).toHaveLength(3)
    expect((await as(WORKER, repos).get('/print/farm')).status).toBe(403)
    expect((await as(WORKER, repos).get('/print/pond/p1')).status).toBe(403)
  })

  it('sending the sheet into the chat is not built yet: 501', async () => {
    const res = await as(OWNER, seeded()).post('/print/send', { sheet: 'farm' })
    expect(res.status).toBe(501)
    expect(res.body).toEqual({ error: 'not_built_yet' })
  })
})
