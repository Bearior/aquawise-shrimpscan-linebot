import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { createMemoryRepos, type MemoryRepos, type MemoryState } from '../../data/memory.js'
import type { FarmRow, MemberRow, PondRow } from '../../data/types.js'

const KEYS = [
  'ALLOW_DEV_LIFF_AUTH', 'LIFF_DEV_USER_ID', 'K_SERVICE', 'NODE_ENV',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SCAN_DAILY_LIMIT',
] as const
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

const NEW = 'Unew'
const OWNER = 'Uowner'
const WORKER = 'Uworker'
const NN = 'Unongnam'

/** Requests as `who` through the dev auth bypass (read at request time). */
function as(who: string, repos: MemoryRepos | null) {
  process.env.LIFF_DEV_USER_ID = who
  const app = createApp(repos ? { repos } : {})
  const auth = { authorization: 'Bearer dev-liff' }
  return {
    get: (p: string) => request(app).get(`/api/liff${p}`).set(auth),
    post: (p: string, body: unknown) => request(app).post(`/api/liff${p}`).set(auth).send(body as object),
    patch: (p: string, body: unknown) => request(app).patch(`/api/liff${p}`).set(auth).send(body as object),
  }
}

const oaFarm: FarmRow = { id: 'farm-oa', name: 'ฟาร์มสายน้ำ', createdBy: OWNER, createdVia: 'shrimp_scan_oa', accessLevel: 'scan_only' }
const ownerRow: MemberRow = { id: 'm-owner', farmId: 'farm-oa', lineUserId: OWNER, role: 'owner', name: 'พี่วิชัย', pondIds: [], status: 'active' }
const workerRow: MemberRow = { id: 'm-worker', farmId: 'farm-oa', lineUserId: WORKER, role: 'worker', name: 'น้องเอ', pondIds: ['p1'], status: 'active' }
const ponds: PondRow[] = [
  { id: 'p1', farmId: 'farm-oa', code: 'A01', netId: null },
  { id: 'p2', farmId: 'farm-oa', code: 'B01', netId: null },
]

function oaRepos(extra: Partial<MemoryState> = {}): MemoryRepos {
  return createMemoryRepos({ farms: [oaFarm], members: [ownerRow, workerRow], ponds, ...extra })
}

const nongNamFarm: FarmRow = { id: 'farm-nn', name: 'ฟาร์มน้องน้ำ', createdBy: NN, createdVia: 'onboarding', accessLevel: 'platform' }

function nothingWritten(repos: MemoryRepos, farms: number): void {
  expect(repos.state.farms).toHaveLength(farms)
  expect(repos.state.lineUsers.filter((u) => u.platformAccess === 'scan_only')).toHaveLength(0)
}

describe('GET /session', () => {
  it('a new person gets an empty session and nothing is written', async () => {
    const repos = createMemoryRepos()
    const res = await as(NEW, repos).get('/session')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ farm: null, role: null, candidate: null, pondIds: [], creditsLeft: 0 })
    expect(res.body.permissions).toEqual({ editOthers: false, measureInbox: false, farmOverview: false, printSheet: false, remindMissing: true })
    expect(res.body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(repos.state.farms).toHaveLength(0)
    expect(repos.state.lineUsers).toHaveLength(0)
  })

  it('an owner gets the farm, every pond and the credits left today', async () => {
    const repos = oaRepos({ quotaUsed: { 'farm-oa': 3 } })
    const res = await as(OWNER, repos).get('/session')
    expect(res.status).toBe(200)
    expect(res.body.user).toEqual({ name: 'พี่วิชัย' })
    expect(res.body.role).toBe('owner')
    expect(res.body.farm).toEqual({
      id: 'farm-oa', name: 'ฟาร์มสายน้ำ', pondCount: 2, zoneCount: 2, memberCount: 2, ownerName: 'พี่วิชัย', targetPerKg: 40,
    })
    expect(res.body.pondIds).toEqual(['p1', 'p2'])
    expect(res.body.permissions.farmOverview).toBe(true)
    expect(res.body.creditsLeft).toBe(17)
  })

  it('reads the daily limit from SCAN_DAILY_LIMIT', async () => {
    process.env.SCAN_DAILY_LIMIT = '60'
    const res = await as(OWNER, oaRepos({ quotaUsed: { 'farm-oa': 3 } })).get('/session')
    expect(res.body.creditsLeft).toBe(57)
  })

  it('falls back to the whole limit when the quota cannot be read', async () => {
    const res = await as(OWNER, oaRepos({ quotaDown: true })).get('/session')
    expect(res.status).toBe(200)
    expect(res.body.creditsLeft).toBe(20)
  })

  it('a worker gets only their ponds and no size permission', async () => {
    const res = await as(WORKER, oaRepos()).get('/session')
    expect(res.status).toBe(200)
    expect(res.body.role).toBe('worker')
    expect(res.body.pondIds).toEqual(['p1'])
    expect(res.body.permissions).toEqual({ editOthers: false, measureInbox: false, farmOverview: false, printSheet: false, remindMissing: true })
  })
})

describe('POST /start', () => {
  it('creates an OA farm, its owner and its ponds', async () => {
    const repos = createMemoryRepos()
    const res = await as(NEW, repos).post('/start', { name: ' ฟาร์มทดสอบ ', ponds: ['A01', 'A02', 'B01'] })
    expect(res.status).toBe(200)
    expect(res.body.role).toBe('owner')
    expect(res.body.farm).toMatchObject({ name: 'ฟาร์มทดสอบ', pondCount: 3, zoneCount: 2, memberCount: 1, targetPerKg: 40 })
    expect(res.body.pondIds).toHaveLength(3)
    expect(res.body.user.name).toBe('เจ้าของฟาร์ม')
    const farm = repos.state.farms[0]!
    expect(farm).toMatchObject({ name: 'ฟาร์มทดสอบ', createdBy: NEW, createdVia: 'shrimp_scan_oa', accessLevel: 'scan_only' })
    expect(repos.state.lineUsers).toEqual([{ id: NEW, platformAccess: 'scan_only', signupSource: 'shrimp_scan_oa', onboarded: false, erased: false }])
    expect(repos.state.members).toMatchObject([{ farmId: farm.id, lineUserId: NEW, role: 'owner', status: 'active' }])
    expect(repos.state.ponds.map((p) => [p.farmId, p.code])).toEqual([[farm.id, 'A01'], [farm.id, 'A02'], [farm.id, 'B01']])
  })

  it('keeps a signup source the person already has', async () => {
    const repos = createMemoryRepos({ lineUsers: [{ id: NEW, platformAccess: 'full', signupSource: 'liff', onboarded: false, erased: false }] })
    const res = await as(NEW, repos).post('/start', { name: 'ฟาร์ม', ponds: ['A01'] })
    expect(res.status).toBe(200)
    expect(repos.state.lineUsers).toEqual([{ id: NEW, platformAccess: 'scan_only', signupSource: 'liff', onboarded: false, erased: false }])
  })

  it('a pond code with no letter is zone 1', async () => {
    const res = await as(NEW, createMemoryRepos()).post('/start', { name: 'ฟาร์ม', ponds: ['1', '2', 'b1'] })
    expect(res.body.farm.zoneCount).toBe(2)
  })

  it('the same start twice gives one farm', async () => {
    const repos = createMemoryRepos()
    const first = await as(NEW, repos).post('/start', { name: 'ฟาร์มทดสอบ', ponds: ['A01'] })
    const second = await as(NEW, repos).post('/start', { name: 'ฟาร์มทดสอบ', ponds: ['A01'] })
    expect(second.status).toBe(200)
    expect(second.body.farm.id).toBe(first.body.farm.id)
    expect(repos.state.farms).toHaveLength(1)
  })

  it('two starts at once (a double tap) give one farm', async () => {
    const repos = createMemoryRepos()
    const c = as(NEW, repos)
    const [a, b] = await Promise.all([
      c.post('/start', { name: 'ฟาร์มทดสอบ', ponds: ['A01', 'A02'] }),
      c.post('/start', { name: 'ฟาร์มทดสอบ', ponds: ['A01', 'A02'] }),
    ])
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(a.body.farm.id).toBe(b.body.farm.id)
    expect(repos.state.farms).toHaveLength(1)
    expect(repos.state.ponds).toHaveLength(2)
  })

  it('refuses a farm from น้องน้ำ (useFarmId) without writing', async () => {
    const repos = createMemoryRepos()
    const res = await as(NEW, repos).post('/start', { useFarmId: 'farm-nn' })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'use_nong_nam' })
    nothingWritten(repos, 0)
  })

  it.each([
    ['a blank name', { name: '  ', ponds: ['A01'] }],
    ['no ponds', { name: 'ฟาร์ม', ponds: [] }],
    ['a duplicate code', { name: 'ฟาร์ม', ponds: ['A01', 'a01'] }],
    ['a blank code', { name: 'ฟาร์ม', ponds: ['A01', ' '] }],
    ['a code that is not text', { name: 'ฟาร์ม', ponds: [1] }],
    ['no name', { ponds: ['A01'] }],
    ['a long name', { name: 'ก'.repeat(81), ponds: ['A01'] }],
    ['a long code', { name: 'ฟาร์ม', ponds: ['A'.repeat(21)] }],
    ['too many ponds', { name: 'ฟาร์ม', ponds: Array.from({ length: 301 }, (_, i) => `A${i}`) }],
    ['no body', undefined],
  ])('answers 400 bad_request for %s', async (_label, body) => {
    const repos = createMemoryRepos()
    const res = await as(NEW, repos).post('/start', body)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'bad_request' })
    nothingWritten(repos, 0)
  })

  it('refuses an erased account without writing', async () => {
    const repos = createMemoryRepos({ lineUsers: [{ id: NEW, platformAccess: 'full', signupSource: null, onboarded: false, erased: true }] })
    const res = await as(NEW, repos).post('/start', { name: 'ฟาร์ม', ponds: ['A01'] })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'not_allowed' })
    nothingWritten(repos, 0)
  })
})

describe('the guard: a person who already uses น้องน้ำ', () => {
  const cases: [string, Partial<MemoryState>][] = [
    ['owns an onboarding farm', {
      farms: [nongNamFarm],
      members: [{ id: 'm-nn', farmId: 'farm-nn', lineUserId: NN, role: 'owner', name: 'พี่นก', pondIds: [], status: 'active' }],
    }],
    ['left a น้องน้ำ farm', {
      farms: [nongNamFarm],
      members: [{ id: 'm-nn', farmId: 'farm-nn', lineUserId: NN, role: 'worker', name: 'พี่นก', pondIds: [], status: 'left' }],
    }],
    ['made a web scan farm', {
      farms: [{ ...nongNamFarm, createdVia: 'shrimp_scan_web', accessLevel: 'scan_only' }],
    }],
    ['finished น้องน้ำ onboarding without a farm', {
      lineUsers: [{ id: NN, platformAccess: 'full', signupSource: 'liff', onboarded: true, erased: false }],
    }],
  ]

  it.each(cases)('gets 403 use_nong_nam on session, start and target when the person %s', async (_label, seed) => {
    const repos = createMemoryRepos(seed)
    const farmsBefore = repos.state.farms.length
    const c = as(NN, repos)
    for (const res of [
      await c.get('/session'),
      await c.post('/start', { name: 'ฟาร์ม', ponds: ['A01'] }),
      await c.patch('/farm', { targetPerKg: 45 }),
    ]) {
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'use_nong_nam' })
    }
    nothingWritten(repos, farmsBefore)
    expect(repos.state.ponds).toHaveLength(0)
  })
})

describe('PATCH /farm', () => {
  it('the owner sets the target size', async () => {
    const repos = oaRepos()
    const res = await as(OWNER, repos).patch('/farm', { targetPerKg: 45 })
    expect(res.status).toBe(200)
    expect(res.body.farm.targetPerKg).toBe(45)
    expect(repos.state.targets['farm-oa']).toBe(45)
  })

  it.each([60, 0, 40.5, '40', null])('answers 400 for %s', async (n) => {
    const repos = oaRepos()
    const res = await as(OWNER, repos).patch('/farm', { targetPerKg: n })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'bad_request' })
    expect(repos.state.targets['farm-oa']).toBeUndefined()
  })

  it('refuses anyone but the owner', async () => {
    const repos = oaRepos({
      members: [ownerRow, workerRow, { ...workerRow, id: 'm-mgr', lineUserId: 'Umgr', role: 'manager', name: 'พี่บี' }],
    })
    for (const who of [WORKER, 'Umgr']) {
      const res = await as(who, repos).patch('/farm', { targetPerKg: 45 })
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'not_allowed' })
    }
    expect(repos.state.targets['farm-oa']).toBeUndefined()
  })

  it('answers 409 no_farm to a person with no farm', async () => {
    const res = await as(NEW, createMemoryRepos()).patch('/farm', { targetPerKg: 45 })
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'no_farm' })
  })
})

describe('no database', () => {
  it('answers 503 db_not_configured when SUPABASE_URL is unset and nothing is injected', async () => {
    const res = await as(NEW, null).get('/session')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'db_not_configured' })
  })

  it('still answers 501 for a route part 1 does not build', async () => {
    const res = await as(OWNER, oaRepos()).get('/overview')
    expect(res.status).toBe(501)
    expect(res.body).toEqual({ error: 'not_built_yet' })
  })
})
