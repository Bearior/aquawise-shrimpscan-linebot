import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Net } from '../../contract/types.js'
import { createApp } from '../../app.js'
import { createMemoryRepos, type MemoryRepos, type MemoryState } from '../../data/memory.js'
import type { FarmRow, MemberRow, NetRow, PondRow, ScanRow } from '../../data/types.js'
import { netOf } from './nets.js'

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
const WORKER = 'Uworker'

function as(who: string, repos: MemoryRepos) {
  process.env.LIFF_DEV_USER_ID = who
  const app = createApp({ repos })
  const auth = { authorization: 'Bearer dev-liff' }
  return {
    get: (p: string) => request(app).get(`/api/liff${p}`).set(auth),
    post: (p: string, body: unknown) => request(app).post(`/api/liff${p}`).set(auth).send(body as object),
    patch: (p: string, body: unknown) => request(app).patch(`/api/liff${p}`).set(auth).send(body as object),
  }
}

const farm: FarmRow = { id: 'farm-oa', name: 'ฟาร์มสายน้ำ', createdBy: OWNER, createdVia: 'shrimp_scan_oa', accessLevel: 'scan_only' }
const other: FarmRow = { ...farm, id: 'farm-other', createdBy: 'Uother' }
const members: MemberRow[] = [
  { id: 'm-owner', farmId: farm.id, lineUserId: OWNER, role: 'owner', name: 'พี่วิชัย', pondIds: [], status: 'active' },
  { id: 'm-manager', farmId: farm.id, lineUserId: MANAGER, role: 'manager', name: 'บังดล', pondIds: [], status: 'active' },
  { id: 'm-worker', farmId: farm.id, lineUserId: WORKER, role: 'worker', name: 'น้องเอ', pondIds: ['p1'], status: 'active' },
]
const ponds: PondRow[] = [
  { id: 'p1', farmId: farm.id, code: 'E01', netId: null },
  { id: 'p2', farmId: farm.id, code: 'E02', netId: null },
  { id: 'p3', farmId: farm.id, code: 'E03', netId: null },
  { id: 'px', farmId: other.id, code: 'E01', netId: null },
]
const farmNet: NetRow = { id: 'net-82', farmId: farm.id, cm: 82, createdBy: OWNER, createdAt: '2026-10-20T03:00:00Z', archivedAt: null }
const smallNet: NetRow = { id: 'net-75', farmId: farm.id, cm: 75, createdBy: MANAGER, createdAt: '2026-10-21T03:00:00Z', archivedAt: null }
const otherNet: NetRow = { id: 'net-other', farmId: other.id, cm: 82, createdBy: 'Uother', createdAt: '2026-10-01T03:00:00Z', archivedAt: null }

const fresh = (extra: Partial<MemoryState> = {}) =>
  createMemoryRepos({ farms: [farm, other], members, ponds, ...extra })

const withNets = (extra: Partial<MemoryState> = {}) =>
  fresh({
    nets: [farmNet, smallNet, otherNet],
    ponds: ponds.map((p) => (p.id === 'p2' || p.id === 'p3' ? { ...p, netId: smallNet.id } : p)),
    ...extra,
  })

function measuredWith(netId: string): ScanRow {
  return {
    id: 's1', farmId: farm.id, pondId: 'p1', lineUserId: WORKER, status: 'ok', sampleDate: '2026-10-25',
    measuredAt: '2026-10-25T01:00:00Z', createdAt: '2026-10-25T00:59:00Z', abw: 12, perKg: 83, cv: 0.1, n: 60,
    flags: [], imageFileId: 'img-1', netId,
  }
}

const live = (repos: MemoryRepos) => repos.state.nets.filter((n) => n.farmId === farm.id && !n.archivedAt)

describe('GET /nets', () => {
  it('lists the live ยอ oldest first: the first is the farm ยอ, the others name their ponds', async () => {
    const repos = withNets()
    const res = await as(OWNER, repos).get('/nets')
    expect(res.status).toBe(200)
    const nets = res.body.nets as Net[]
    expect(nets.map((n) => n.id)).toEqual(['net-82', 'net-75'])
    expect(nets[0]).toMatchObject({ shape: 'round', cm: 82, use: 'ยอของฟาร์ม', pondCount: 1, isFarmDefault: true, addedBy: 'พี่วิชัยใส่ 20 ต.ค.', addedOn: '2026-10-20' })
    expect(nets[1]).toMatchObject({ cm: 75, use: 'E02 ถึง E03', pondCount: 2, isFarmDefault: false, addedBy: 'บังดลใส่ 21 ต.ค.' })
  })

  it('a ยอ no pond uses says so', async () => {
    const repos = withNets({ ponds })
    const nets = (await as(OWNER, repos).get('/nets')).body.nets as Net[]
    expect(nets[1]).toMatchObject({ use: 'ยังไม่ผูกบ่อ', pondCount: 0 })
    expect(nets[0]!.pondCount).toBe(3)
  })

  it('a worker may read the ยอ (the scan shows the pond ยอ as a chip)', async () => {
    const res = await as(WORKER, withNets()).get('/nets')
    expect(res.status).toBe(200)
    expect((res.body.nets as Net[]).length).toBe(2)
  })
})

describe('POST /nets', () => {
  it('the first ยอ of a farm is the farm ยอ', async () => {
    const repos = fresh()
    const res = await as(OWNER, repos).post('/nets', { shape: 'round', cm: 82 })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ shape: 'round', cm: 82, isFarmDefault: true, use: 'ยอของฟาร์ม' })
    expect(live(repos)).toHaveLength(1)
    expect(live(repos)[0]).toMatchObject({ cm: 82, createdBy: OWNER })
  })

  it('a ยอ added for a pond becomes that pond ยอ', async () => {
    const repos = withNets()
    const res = await as(OWNER, repos).post('/nets', { shape: 'round', cm: 60, pondId: 'p1' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ cm: 60, isFarmDefault: false, use: 'E01', pondCount: 1 })
    expect(repos.state.ponds.find((p) => p.id === 'p1')!.netId).toBe(res.body.id)
  })

  it('a later ยอ never takes over as the farm ยอ, farmDefault or not', async () => {
    const repos = withNets()
    const res = await as(OWNER, repos).post('/nets', { shape: 'round', cm: 90, farmDefault: true })
    expect(res.body.isFarmDefault).toBe(false)
    const nets = (await as(OWNER, repos).get('/nets')).body.nets as Net[]
    expect(nets[0]!.id).toBe('net-82')
  })

  it('a size the farm already has is that same ยอ, so a double tap adds one', async () => {
    const repos = withNets()
    const a = as(OWNER, repos)
    const [one, two] = await Promise.all([a.post('/nets', { shape: 'round', cm: 90 }), a.post('/nets', { shape: 'round', cm: 90 })])
    expect(one.status).toBe(200)
    expect(two.status).toBe(200)
    expect(two.body.id).toBe(one.body.id)
    expect(live(repos).filter((n) => n.cm === 90)).toHaveLength(1)
    const again = await a.post('/nets', { shape: 'round', cm: 75, pondId: 'p1' })
    expect(again.body.id).toBe('net-75')
    expect(repos.state.ponds.find((p) => p.id === 'p1')!.netId).toBe('net-75')
  })

  it('a size outside 30 to 200 cm, or not whole, is net_out_of_range', async () => {
    const a = as(OWNER, fresh())
    for (const cm of [29, 201, 82.5, '82', null]) {
      const res = await a.post('/nets', { shape: 'round', cm })
      expect(res.status, String(cm)).toBe(422)
      expect(res.body).toEqual({ error: 'net_out_of_range' })
    }
  })

  it('a square ยอ is not supported yet', async () => {
    const res = await as(OWNER, fresh()).post('/nets', { shape: 'square', cm: 100 })
    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'net_shape_unsupported' })
  })

  it('an unknown shape is a bad request', async () => {
    const res = await as(OWNER, fresh()).post('/nets', { shape: 'oval', cm: 100 })
    expect(res.status).toBe(400)
  })

  it('a pond of another farm is not found and adds nothing', async () => {
    const repos = withNets()
    const res = await as(OWNER, repos).post('/nets', { shape: 'round', cm: 60, pondId: 'px' })
    expect(res.status).toBe(404)
    expect(live(repos)).toHaveLength(2)
  })

  it('a worker may not add a ยอ; a manager may', async () => {
    const repos = fresh()
    const res = await as(WORKER, repos).post('/nets', { shape: 'round', cm: 82 })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'not_allowed' })
    expect(live(repos)).toHaveLength(0)
    expect((await as(MANAGER, repos).post('/nets', { shape: 'round', cm: 82 })).status).toBe(200)
  })
})

describe('PATCH /nets/:id', () => {
  it('a ยอ that measured nothing yet is corrected in place', async () => {
    const repos = withNets()
    const res = await as(OWNER, repos).patch('/nets/net-75', { cm: 70 })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: 'net-75', cm: 70, use: 'E02 ถึง E03' })
    expect(live(repos).map((n) => n.cm)).toEqual([82, 70])
  })

  it('a ยอ that measured a photo is replaced: old photos keep their size, its ponds move, and the farm ยอ stays the farm ยอ', async () => {
    const repos = withNets({ scans: [measuredWith('net-82')] })
    const res = await as(OWNER, repos).patch('/nets/net-82', { cm: 80 })
    expect(res.status).toBe(200)
    expect(res.body.id).not.toBe('net-82')
    expect(res.body).toMatchObject({ cm: 80, isFarmDefault: true, use: 'ยอของฟาร์ม', addedBy: 'พี่วิชัยใส่ 20 ต.ค.' })
    expect(repos.state.nets.find((n) => n.id === 'net-82')!.archivedAt).not.toBeNull()
    const nets = (await as(OWNER, repos).get('/nets')).body.nets as Net[]
    expect(nets.map((n) => [n.id, n.cm])).toEqual([[res.body.id, 80], ['net-75', 75]])
  })

  it('a replaced pond ยอ takes its ponds with it', async () => {
    const repos = withNets({ scans: [measuredWith('net-75')] })
    const res = await as(OWNER, repos).patch('/nets/net-75', { cm: 70 })
    expect(res.body).toMatchObject({ cm: 70, use: 'E02 ถึง E03', pondCount: 2 })
    expect(repos.state.ponds.filter((p) => p.netId === res.body.id).map((p) => p.id)).toEqual(['p2', 'p3'])
  })

  it('the same size is a no-op', async () => {
    const repos = withNets({ scans: [measuredWith('net-82')] })
    const res = await as(OWNER, repos).patch('/nets/net-82', { cm: 82, shape: 'round' })
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('net-82')
  })

  it('a size another ยอ of the farm already has is net_exists', async () => {
    const repos = withNets()
    const res = await as(OWNER, repos).patch('/nets/net-75', { cm: 82 })
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'net_exists' })
    expect(live(repos).map((n) => n.cm)).toEqual([82, 75])
  })

  it('refuses a bad size, a square shape, a worker, and a ยอ of another farm', async () => {
    const repos = withNets()
    expect((await as(OWNER, repos).patch('/nets/net-75', { cm: 201 })).body).toEqual({ error: 'net_out_of_range' })
    expect((await as(OWNER, repos).patch('/nets/net-75', { cm: 75, shape: 'square' })).body).toEqual({ error: 'net_shape_unsupported' })
    expect((await as(WORKER, repos).patch('/nets/net-75', { cm: 70 })).status).toBe(403)
    expect((await as(OWNER, repos).patch('/nets/net-other', { cm: 70 })).status).toBe(404)
    expect(live(repos).map((n) => n.cm)).toEqual([82, 75])
  })
})

describe('netOf', () => {
  it('is the pond ยอ, else the farm ยอ, else none', async () => {
    const repos = withNets()
    expect((await netOf(repos, farm.id, 'p2'))?.id).toBe('net-75')
    expect((await netOf(repos, farm.id, 'p1'))?.id).toBe('net-82')
    expect(await netOf(fresh(), farm.id, 'p1')).toBeNull()
  })

  it('a pond pointing at a ยอ that is gone falls back to the farm ยอ', async () => {
    const repos = withNets({ ponds: ponds.map((p) => (p.id === 'p1' ? { ...p, netId: 'net-gone' } : p)) })
    expect((await netOf(repos, farm.id, 'p1'))?.id).toBe('net-82')
  })
})
