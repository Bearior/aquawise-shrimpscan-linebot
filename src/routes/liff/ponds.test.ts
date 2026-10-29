import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { createMemoryRepos, type MemoryRepos, type MemoryState } from '../../data/memory.js'
import type { FarmRow, MemberRow, NetRow, PondRow, ScanRow } from '../../data/types.js'
import { addDays, bangkokDay } from '../../domain/farm.js'
import { userTag } from '../liff-me.js'

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
const TODAY = bangkokDay()

function as(who: string, repos: MemoryRepos) {
  process.env.LIFF_DEV_USER_ID = who
  const app = createApp({ repos })
  const auth = { authorization: 'Bearer dev-liff' }
  return {
    get: (p: string) => request(app).get(`/api/liff${p}`).set(auth),
    put: (p: string, body: unknown) => request(app).put(`/api/liff${p}`).set(auth).send(body as object),
  }
}

const farm: FarmRow = { id: 'farm-oa', name: 'ฟาร์มสายน้ำ', createdBy: OWNER, createdVia: 'shrimp_scan_oa', accessLevel: 'scan_only' }
const other: FarmRow = { ...farm, id: 'farm-other', createdBy: 'Uother' }
const owner: MemberRow = { id: 'm-owner', farmId: farm.id, lineUserId: OWNER, role: 'owner', name: 'พี่วิชัย', pondIds: [], status: 'active' }
const worker: MemberRow = { id: 'm-worker', farmId: farm.id, lineUserId: WORKER, role: 'worker', name: 'น้องเอ', pondIds: ['p1', 'p2'], status: 'active' }
const ponds: PondRow[] = [
  { id: 'p3', farmId: farm.id, code: 'B01', netId: null },
  { id: 'p1', farmId: farm.id, code: 'A01', netId: null },
  { id: 'p2', farmId: farm.id, code: 'A02', netId: 'net-small' },
  { id: 'px', farmId: other.id, code: 'A01', netId: null },
]
const nets: NetRow[] = [
  { id: 'net-farm', farmId: farm.id, cm: 82, createdBy: OWNER, createdAt: '2026-09-01T00:00:00Z', archivedAt: null },
  { id: 'net-small', farmId: farm.id, cm: 60, createdBy: OWNER, createdAt: '2026-09-02T00:00:00Z', archivedAt: null },
  { id: 'net-other', farmId: other.id, cm: 82, createdBy: 'Uother', createdAt: '2026-09-01T00:00:00Z', archivedAt: null },
]

function scan(id: string, pondId: string, day: string, abw: number, over: Partial<ScanRow> = {}): ScanRow {
  return {
    id, farmId: farm.id, pondId, lineUserId: WORKER, status: 'ok', sampleDate: day,
    measuredAt: `${day}T01:00:00.000Z`, createdAt: `${day}T00:59:00.000Z`,
    abw, perKg: Math.round(1000 / abw), cv: 0.1, n: 60, flags: [], imageFileId: `img-${id}`, ...over,
  }
}

function seeded(extra: Partial<MemoryState> = {}): MemoryRepos {
  return createMemoryRepos({
    farms: [farm, other],
    members: [owner, worker],
    ponds,
    nets,
    scans: [
      scan('s1', 'p1', addDays(TODAY, -2), 10.0),
      scan('s2', 'p1', addDays(TODAY, -1), 10.3),
      scan('s3', 'p1', TODAY, 10.6, { flags: ['note:กินดี'] }),
      // measured but never saved: not part of the pond's history
      scan('s4', 'p1', TODAY, 99, { sampleDate: null }),
      scan('s5', 'p2', addDays(TODAY, -1), 12.0),
    ],
    cycles: [{ id: 'c1', pondId: 'p1', farmId: farm.id, stockedOn: addDays(TODAY, -40), count: 200_000, survival: 0.8, open: true }],
    ...extra,
  })
}

describe('GET /ponds', () => {
  it('gives the owner one tile per pond in code order, and the zones', async () => {
    const res = await as(OWNER, seeded()).get('/ponds')
    expect(res.status).toBe(200)
    expect(res.body.ponds.map((t: { code: string }) => t.code)).toEqual(['A01', 'A02', 'B01'])
    expect(res.body.zones).toEqual([
      { zone: 'A', caretaker: 'น้องเอ', total: 2, photoToday: 1 },
      { zone: 'B', caretaker: null, total: 1, photoToday: 0 },
    ])
    const [a01, a02, b01] = res.body.ponds
    expect(a01).toMatchObject({ id: 'p1', abw: 10.6, perKg: 94, gPerDay: 0.3, photoToday: true, mine: true, ageDays: 40, netId: 'net-farm', caretaker: 'น้องเอ' })
    expect(a02).toMatchObject({ status: 'missing', abw: 12, netId: 'net-small' })
    expect(b01).toMatchObject({ status: 'missing', abw: null, caretaker: null })
  })

  it('a farm with no ยอ gives tiles no netId', async () => {
    const res = await as(OWNER, seeded({ nets: [] })).get('/ponds')
    expect(res.body.ponds[0].netId).toBeNull()
    expect(res.body.ponds[1].netId).toBe('net-small')
  })
})

describe('a worker sees no sizes', () => {
  it.each(['/ponds', '/ponds/p1', '/ponds/p1/scans', '/ponds/p1/stocking'])('GET %s is 403 not_allowed', async (path) => {
    const res = await as(WORKER, seeded()).get(path)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'not_allowed' })
  })

  it('and cannot change stocking or the ยอ', async () => {
    const repos = seeded()
    const c = as(WORKER, repos)
    expect((await c.put('/ponds/p1/stocking', { stockedOn: null, count: null, survival: null })).status).toBe(403)
    expect((await c.put('/ponds/p1/net', { netId: 'net-small' })).status).toBe(403)
    expect(repos.state.ponds.find((p) => p.id === 'p1')!.netId).toBeNull()
  })
})

describe('GET /ponds/:id', () => {
  it('gives the pond, its growth, the latest scan and its neighbours', async () => {
    const res = await as(OWNER, seeded()).get('/ponds/p1')
    expect(res.status).toBe(200)
    const d = res.body
    expect(d.pond.code).toBe('A01')
    expect(d.growth).toEqual([
      { day: 38, abw: 10, date: addDays(TODAY, -2) },
      { day: 39, abw: 10.3, date: addDays(TODAY, -1) },
      { day: 40, abw: 10.6, date: TODAY },
    ])
    expect(d.latest).toMatchObject({ scanId: 's3', date: TODAY, abw: 10.6, perKg: 94, photoUrl: 'https://photos.test/img-s3', photoBy: 'น้องเอ', measuredBy: 'น้องเอ', fixed: null, canFix: true })
    expect(d.latestShrimpGrams).toEqual([])
    expect(d.stocking).toEqual({ stockedOn: addDays(TODAY, -40), count: 200_000, survival: 0.8 })
    expect(d.tonnesNow).toBe(1.7)
    expect(d.note).toEqual({ by: 'น้องเอ', at: `${TODAY}T01:00:00.000Z`, text: 'กินดี' })
    expect(d).toMatchObject({ prevId: null, prevCode: null, nextId: 'p2', nextCode: 'A02' })
    expect(d.onTimeChance).toBeNull()
  })

  it('a pond with no stocking has no tonnes and growth days from 0', async () => {
    const res = await as(OWNER, seeded({ cycles: [] })).get('/ponds/p2')
    expect(res.body.stocking).toEqual({ stockedOn: null, count: null, survival: null })
    expect(res.body.tonnesNow).toBeNull()
    expect(res.body.growth).toEqual([{ day: 0, abw: 12, date: addDays(TODAY, -1) }])
    expect(res.body).toMatchObject({ prevCode: 'A01', nextCode: 'B01' })
  })

  it('a pond of another farm is 404 not_found', async () => {
    const res = await as(OWNER, seeded()).get('/ponds/px')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'not_found' })
  })

  it('a person blocked by the guard gets 403 use_nong_nam', async () => {
    const repos = createMemoryRepos({ farms: [{ ...farm, createdVia: 'onboarding' }], members: [owner], ponds })
    const res = await as(OWNER, repos).get('/ponds')
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'use_nong_nam' })
  })
})

describe('GET /ponds/:id/scans', () => {
  it('lists saved scans newest first, with who fixed one and which got lighter', async () => {
    const repos = seeded({
      scans: [
        scan('s1', 'p1', addDays(TODAY, -1), 10.0),
        scan('s2', 'p1', TODAY, 9.5, { lineUserId: OWNER, flags: [`fixed:${userTag(OWNER)}:105`] }),
      ],
    })
    const res = await as(OWNER, repos).get('/ponds/p1/scans')
    expect(res.status).toBe(200)
    expect(res.body.pond.id).toBe('p1')
    expect(res.body.scans.map((s: { scanId: string }) => s.scanId)).toEqual(['s2', 's1'])
    expect(res.body.scans[0]).toMatchObject({ photoBy: 'พี่วิชัย', lighter: true, fixed: { by: 'พี่วิชัย', at: `${TODAY}T01:00:00.000Z`, oldPerKg: 105 } })
    expect(res.body.scans[1]).toMatchObject({ lighter: false, fixed: null })
  })
})

describe('stocking', () => {
  it('PUT then GET gives the same values, on one open cycle', async () => {
    const repos = seeded({ cycles: [] })
    const c = as(OWNER, repos)
    const body = { stockedOn: '2026-10-01', count: 200000, survival: 0.8 }
    const put = await c.put('/ponds/p1/stocking', body)
    expect(put.status).toBe(200)
    expect(put.body).toEqual(body)
    expect((await c.get('/ponds/p1/stocking')).body).toEqual(body)
    await c.put('/ponds/p1/stocking', { stockedOn: '2026-10-02', count: 180000, survival: null })
    expect((await c.get('/ponds/p1/stocking')).body).toEqual({ stockedOn: '2026-10-02', count: 180000, survival: null })
    expect(repos.state.cycles.filter((x) => x.pondId === 'p1' && x.open)).toHaveLength(1)
    expect(repos.state.cycles[0]).toMatchObject({ farmId: farm.id, lineUserId: OWNER })
  })

  it.each([
    ['a negative count', { stockedOn: null, count: -1, survival: null }],
    ['a count that is not whole', { stockedOn: null, count: 1.5, survival: null }],
    ['survival over 1', { stockedOn: null, count: null, survival: 1.5 }],
    ['survival 0', { stockedOn: null, count: null, survival: 0 }],
    ['a date that is not a date', { stockedOn: '2026-13-01', count: null, survival: null }],
    ['a date in the future', { stockedOn: addDays(TODAY, 2), count: null, survival: null }],
    ['a missing field', { stockedOn: null, count: null }],
  ])('answers 400 for %s', async (_label, body) => {
    const repos = seeded({ cycles: [] })
    const res = await as(OWNER, repos).put('/ponds/p1/stocking', body)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'bad_request' })
    expect(repos.state.cycles).toHaveLength(0)
  })
})

describe('PUT /ponds/:id/net', () => {
  it('sets the pond ยอ to one of the farm', async () => {
    const repos = seeded()
    const res = await as(OWNER, repos).put('/ponds/p1/net', { netId: 'net-small' })
    expect(res.status).toBe(204)
    expect(repos.state.ponds.find((p) => p.id === 'p1')!.netId).toBe('net-small')
  })

  it('a ยอ of another farm is 404 and changes nothing', async () => {
    const repos = seeded()
    const res = await as(OWNER, repos).put('/ponds/p1/net', { netId: 'net-other' })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'not_found' })
    expect(repos.state.ponds.find((p) => p.id === 'p1')!.netId).toBeNull()
  })

  it('a body with no netId is 400', async () => {
    const res = await as(OWNER, seeded()).put('/ponds/p1/net', {})
    expect(res.status).toBe(400)
  })
})
