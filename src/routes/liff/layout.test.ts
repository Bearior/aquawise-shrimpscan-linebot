import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { createMemoryRepos, type MemoryRepos } from '../../data/memory.js'
import type { FarmRow, MemberRow, PondRow } from '../../data/types.js'

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
const MANAGER = 'Umanager'

function as(who: string, repos: MemoryRepos) {
  process.env.LIFF_DEV_USER_ID = who
  const app = createApp({ repos })
  const auth = { authorization: 'Bearer dev-liff' }
  return {
    get: (p: string) => request(app).get(`/api/liff${p}`).set(auth),
    post: (p: string, body: unknown) => request(app).post(`/api/liff${p}`).set(auth).send(body as object),
    put: (p: string, body: unknown) => request(app).put(`/api/liff${p}`).set(auth).send(body as object),
    patch: (p: string, body: unknown) => request(app).patch(`/api/liff${p}`).set(auth).send(body as object),
  }
}

const farm: FarmRow = { id: 'farm-oa', name: 'ฟาร์มสายน้ำ', createdBy: OWNER, createdVia: 'shrimp_scan_oa', accessLevel: 'scan_only' }
const owner: MemberRow = { id: 'm-owner', farmId: farm.id, lineUserId: OWNER, role: 'owner', name: 'พี่วิชัย', pondIds: [], status: 'active' }
const manager: MemberRow = { id: 'm-manager', farmId: farm.id, lineUserId: MANAGER, role: 'manager', name: 'พี่บี', pondIds: ['p1'], status: 'active' }
const ponds: PondRow[] = [
  { id: 'p1', farmId: farm.id, code: 'A01', netId: null },
  { id: 'p2', farmId: farm.id, code: 'A02', netId: null },
  { id: 'p3', farmId: farm.id, code: 'B01', netId: null },
]
const seeded = () => createMemoryRepos({ farms: [farm], members: [owner, manager], ponds })

describe('PUT /zones/:zone', () => {
  it('names a zone, shows the name on รายบ่อ and the overview, and takes it off again', async () => {
    const repos = seeded()
    expect((await as(OWNER, repos).put('/zones/a', { name: '  หน้า   บ้าน ' })).status).toBe(204)
    expect((await repos.settings.read(farm.id)).zones).toEqual({ A: 'หน้า บ้าน' })
    const list = await as(OWNER, repos).get('/ponds')
    expect(list.body.zones.map((z: { zone: string; name: string | null }) => [z.zone, z.name])).toEqual([['A', 'หน้า บ้าน'], ['B', null]])
    const o = await as(OWNER, repos).get('/overview')
    expect(o.body.photosToday.zones.map((z: { zone: string; name: string | null }) => [z.zone, z.name])).toEqual([['A', 'หน้า บ้าน'], ['B', null]])
    expect((await as(OWNER, repos).put('/zones/A', { name: '' })).status).toBe(204)
    expect((await repos.settings.read(farm.id)).zones).toEqual({})
  })

  it('keeps the farm’s other settings as they were', async () => {
    const repos = seeded()
    const before = await repos.settings.read(farm.id)
    await repos.settings.write(farm.id, { ...before, notify: { ...before.notify, photoIn: false } })
    await as(OWNER, repos).put('/zones/B', { name: 'ริมคลอง' })
    const after = await repos.settings.read(farm.id)
    expect(after.notify.photoIn).toBe(false)
    expect(after.zones).toEqual({ B: 'ริมคลอง' })
  })

  it('refuses a zone with no pond, a name too long, and anyone but the owner', async () => {
    const repos = seeded()
    expect((await as(OWNER, repos).put('/zones/C', { name: 'หลังบ้าน' })).status).toBe(404)
    expect((await as(OWNER, repos).put('/zones/A', { name: 'ก'.repeat(31) })).status).toBe(400)
    expect((await as(OWNER, repos).put('/zones/A', { name: 7 })).status).toBe(400)
    expect((await as(MANAGER, repos).put('/zones/A', { name: 'หน้าบ้าน' })).status).toBe(403)
    expect((await repos.settings.read(farm.id)).zones).toEqual({})
  })
})

describe('POST /ponds', () => {
  it('adds ponds to a zone and makes a new zone, in name order', async () => {
    const repos = seeded()
    const res = await as(OWNER, repos).post('/ponds', { codes: ['A03', 'C01', 'C02'] })
    expect(res.status).toBe(200)
    expect(res.body.ponds.map((p: { code: string }) => p.code)).toEqual(['A03', 'C01', 'C02'])
    const list = await as(OWNER, repos).get('/ponds')
    expect(list.body.ponds.map((t: { code: string }) => t.code)).toEqual(['A01', 'A02', 'A03', 'B01', 'C01', 'C02'])
    expect(list.body.zones.map((z: { zone: string }) => z.zone)).toEqual(['A', 'B', 'C'])
    const s = await as(OWNER, repos).get('/session')
    expect(s.body.farm).toMatchObject({ pondCount: 6, zoneCount: 3 })
  })

  it('refuses a name the farm has (any case), a repeat in the list, an empty list, and over 300 ponds', async () => {
    const repos = seeded()
    const r1 = await as(OWNER, repos).post('/ponds', { codes: ['a01'] })
    expect([r1.status, r1.body.error]).toEqual([409, 'name_taken'])
    expect((await as(OWNER, repos).post('/ponds', { codes: ['C01', 'c01'] })).status).toBe(400)
    expect((await as(OWNER, repos).post('/ponds', { codes: [] })).status).toBe(400)
    expect((await as(OWNER, repos).post('/ponds', { codes: [' '] })).status).toBe(400)
    expect((await as(OWNER, repos).post('/ponds', { codes: ['X'.repeat(21)] })).status).toBe(400)
    const many = createMemoryRepos({
      farms: [farm],
      members: [owner],
      ponds: Array.from({ length: 299 }, (_, i) => ({ id: `q${i}`, farmId: farm.id, code: `Z${i}`, netId: null })),
    })
    const r2 = await as(OWNER, many).post('/ponds', { codes: ['Y1', 'Y2'] })
    expect([r2.status, r2.body.error]).toEqual([409, 'too_many_ponds'])
    expect(repos.state.ponds).toHaveLength(3)
  })

  it('is the owner’s only', async () => {
    const repos = seeded()
    expect((await as(MANAGER, repos).post('/ponds', { codes: ['A03'] })).status).toBe(403)
    expect(repos.state.ponds).toHaveLength(3)
  })
})

describe('PATCH /ponds/:id', () => {
  it('renames a pond inside its zone', async () => {
    const repos = seeded()
    expect((await as(OWNER, repos).patch('/ponds/p2', { code: 'A02หน้าบ้าน' })).status).toBe(204)
    expect(repos.state.ponds.find((p) => p.id === 'p2')?.code).toBe('A02หน้าบ้าน')
  })

  it('refuses a move to another zone, a name taken, a pond of no farm of yours, and anyone but the owner', async () => {
    const repos = seeded()
    expect((await as(OWNER, repos).patch('/ponds/p2', { code: 'B02' })).status).toBe(400)
    const taken = await as(OWNER, repos).patch('/ponds/p2', { code: 'A01' })
    expect([taken.status, taken.body.error]).toEqual([409, 'name_taken'])
    expect((await as(OWNER, repos).patch('/ponds/nope', { code: 'A09' })).status).toBe(404)
    expect((await as(MANAGER, repos).patch('/ponds/p2', { code: 'A09' })).status).toBe(403)
    expect(repos.state.ponds.find((p) => p.id === 'p2')?.code).toBe('A02')
  })
})
