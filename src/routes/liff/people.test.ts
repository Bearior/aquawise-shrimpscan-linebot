import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { createMemoryRepos, type MemoryInvite, type MemoryRepos, type MemoryState } from '../../data/memory.js'
import type { FarmRow, MemberRow, PondRow } from '../../data/types.js'
import { DEFAULTS } from '../../domain/permissions.js'

const KEYS = ['ALLOW_DEV_LIFF_AUTH', 'LIFF_DEV_USER_ID', 'K_SERVICE', 'NODE_ENV', 'SUPABASE_URL', 'LIFF_ID'] as const
const saved: Record<string, string | undefined> = {}
for (const k of KEYS) saved[k] = process.env[k]
beforeEach(() => {
  for (const k of KEYS) delete process.env[k]
  process.env.ALLOW_DEV_LIFF_AUTH = 'true'
  process.env.LIFF_ID = '2010188962-test'
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
const NEW = 'Unew'
/** Owns a farm made in น้องน้ำ. */
const NONG_NAM = 'Unongnam'

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
const nongNamFarm: FarmRow = { id: 'farm-nn', name: 'ฟาร์มน้องน้ำ', createdBy: NONG_NAM, createdVia: 'onboarding', accessLevel: 'full' }
const owner: MemberRow = { id: 'm-owner', farmId: farm.id, lineUserId: OWNER, role: 'owner', name: 'พี่วิชัย', pondIds: [], status: 'active' }
const worker: MemberRow = {
  id: 'm-worker', farmId: farm.id, lineUserId: WORKER, role: 'worker', name: 'น้องเอ', pondIds: ['p1', 'p2'], status: 'active', joinedAt: '2026-09-02T03:00:00Z',
}
const manager: MemberRow = { id: 'm-manager', farmId: farm.id, lineUserId: MANAGER, role: 'manager', name: 'พี่บี', pondIds: ['p3'], status: 'active' }
const nongNamOwner: MemberRow = { id: 'm-nn', farmId: nongNamFarm.id, lineUserId: NONG_NAM, role: 'owner', name: 'พี่ใหญ่', pondIds: [], status: 'active' }
const ponds: PondRow[] = [
  { id: 'p1', farmId: farm.id, code: 'A01', netId: null },
  { id: 'p2', farmId: farm.id, code: 'A02', netId: null },
  { id: 'p3', farmId: farm.id, code: 'B01', netId: null },
]

const later = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

function invite(over: Partial<MemoryInvite> = {}): MemoryInvite {
  return {
    id: 'inv-1', farmKey: OWNER, code: 'K7P2QX', token: 't'.repeat(22), role: 'worker', pondIds: ['p3'], status: 'pending',
    expiresAt: later(7), createdAt: new Date().toISOString(), createdBy: OWNER, ...over,
  }
}

function seeded(extra: Partial<MemoryState> = {}): MemoryRepos {
  return createMemoryRepos({ farms: [farm, nongNamFarm], members: [owner, worker, nongNamOwner], ponds, ...extra })
}

describe('GET /members', () => {
  it('the owner first, each person’s ponds and today, the open invites, and the zones nobody looks after', async () => {
    const res = await as(OWNER, seeded({ invites: [invite()] })).get('/members')
    expect(res.status).toBe(200)
    expect(res.body.members).toEqual([
      { id: 'm-owner', name: 'พี่วิชัย', pictureUrl: null, role: 'owner', scope: 'ทุกบ่อ', joined: 'เจ้าของฟาร์ม', isYou: true },
      { id: 'm-worker', name: 'น้องเอ', pictureUrl: null, role: 'worker', scope: 'ดูแล 2 บ่อ · วันนี้ 0/2', joined: 'เข้าร่วม 2 ก.ย. 2569', isYou: false },
    ])
    expect(res.body.invites).toEqual([
      { code: 'K7P2QX', url: 'https://liff.line.me/2010188962-test/app/join?invite=K7P2QX', role: 'worker', pondsLabel: 'B01', expiresOn: expect.any(String), daysLeft: 7 },
    ])
    expect(res.body.activity).toEqual([{ who: 'น้องเอ', what: 'เข้าร่วมฟาร์ม', when: '2 ก.ย.' }])
    expect(res.body.uncoveredZones).toEqual(['B'])
  })

  it('someone who is not the owner sees the people but no invites', async () => {
    const res = await as(WORKER, seeded({ invites: [invite()] })).get('/members')
    expect(res.status).toBe(200)
    expect(res.body.members.map((m: { isYou: boolean }) => m.isYou)).toEqual([false, true])
    expect(res.body.invites).toEqual([])
  })

  it('an invite past its day, or whose issuer left, is not listed', async () => {
    const res = await as(OWNER, seeded({ invites: [invite({ expiresAt: later(-1) }), invite({ id: 'inv-2', code: 'ABCDEF', createdBy: 'Ugone' })] })).get('/members')
    expect(res.body.invites).toEqual([])
  })
})

describe('invites', () => {
  it('the owner makes one: a six-character code, a LIFF link, the farm’s own ponds only', async () => {
    const repos = seeded()
    const res = await as(OWNER, repos).post('/invites', { role: 'worker', pondIds: ['p3', 'not-a-pond'] })
    expect(res.status).toBe(200)
    expect(res.body.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    expect(res.body).toMatchObject({ url: `https://liff.line.me/2010188962-test/app/join?invite=${res.body.code}`, role: 'worker', pondsLabel: 'B01', daysLeft: 7 })
    const row = repos.state.invites[0]!
    expect(row).toMatchObject({ farmKey: OWNER, createdBy: OWNER, pondIds: ['p3'], status: 'pending' })
    expect(row.token).toMatch(/^[A-Za-z0-9]{22}$/)
  })

  it('only the owner makes or cancels one; a bad role is 400', async () => {
    const repos = seeded({ invites: [invite()] })
    expect((await as(WORKER, repos).post('/invites', { role: 'worker', pondIds: [] })).status).toBe(403)
    expect((await as(OWNER, repos).post('/invites', { role: 'owner', pondIds: [] })).status).toBe(400)
    expect((await as(WORKER, repos).del('/invites/K7P2QX')).status).toBe(403)
  })

  it('a cancelled invite says so; cancelling it again is 404', async () => {
    const repos = seeded({ invites: [invite()] })
    await as(OWNER, repos).del('/invites/k7p-2qx').expect(204)
    const preview = await as(NEW, repos).get('/invites/K7P2QX')
    expect(preview.body).toMatchObject({ valid: false, reason: 'cancelled' })
    expect((await as(OWNER, repos).del('/invites/K7P2QX')).status).toBe(404)
  })

  it('the preview: the farm, who sent it, which ponds; any case and a hyphen read the same', async () => {
    const res = await as(NEW, seeded({ invites: [invite()] })).get('/invites/k7p-2qx')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      code: 'K7P2QX', farmName: 'ฟาร์มสายน้ำ', pondCount: 3, ownerName: 'พี่วิชัย', role: 'worker', pondsLabel: 'B01 · 1 บ่อ', suggestedName: '', valid: true,
    })
  })

  it('an expired invite is shown as expired and cannot be taken', async () => {
    const repos = seeded({ invites: [invite({ expiresAt: later(-1) })] })
    expect((await as(NEW, repos).get('/invites/K7P2QX')).body).toMatchObject({ valid: false, reason: 'expired' })
    const res = await as(NEW, repos).post('/invites/K7P2QX/accept', { displayName: 'น้องซี', lang: 'th', addFriend: true })
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'invite_invalid' })
  })

  it('a code that is not an invite, or is one of น้องน้ำ’s, is 404 invite_invalid', async () => {
    const repos = seeded({ invites: [invite({ farmKey: NONG_NAM })] })
    expect((await as(NEW, repos).get('/invites/K7P2QX')).body).toEqual({ error: 'invite_invalid' })
    expect((await as(NEW, repos).get('/invites/ZZZZZZ')).status).toBe(404)
    expect((await as(NEW, repos).get('/invites/not-a-code!')).status).toBe(404)
  })
})

describe('POST /invites/:code/accept', () => {
  it('joins the farm: the session, the membership, the claim, the scan_only stamp', async () => {
    const repos = seeded({ invites: [invite()] })
    const res = await as(NEW, repos).post('/invites/K7P2QX/accept', { displayName: ' น้องซี ', lang: 'th', addFriend: true })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ user: { name: 'น้องซี' }, role: 'worker', pondIds: ['p3'], farm: { id: farm.id, ownerName: 'พี่วิชัย' } })
    expect(repos.state.members.find((m) => m.lineUserId === NEW)).toMatchObject({ farmId: farm.id, role: 'worker', name: 'น้องซี', pondIds: ['p3'], status: 'active' })
    expect(repos.state.invites[0]).toMatchObject({ status: 'claimed', claimedBy: NEW })
    expect(repos.state.lineUsers.find((u) => u.id === NEW)).toMatchObject({ platformAccess: 'scan_only', signupSource: 'shrimp_scan_oa' })
  })

  it('the ponds it gives leave whoever had them', async () => {
    const repos = seeded({ invites: [invite({ pondIds: ['p1'] })] })
    await as(NEW, repos).post('/invites/K7P2QX/accept', { displayName: 'น้องซี', lang: 'th', addFriend: false }).expect(200)
    expect(repos.state.members.find((m) => m.id === 'm-worker')!.pondIds).toEqual(['p2'])
  })

  it('one invite seats one person; opening it again is harmless', async () => {
    const repos = seeded({ invites: [invite()] })
    await as(NEW, repos).post('/invites/K7P2QX/accept', { displayName: 'น้องซี', lang: 'th', addFriend: true }).expect(200)
    const again = await as(NEW, repos).post('/invites/K7P2QX/accept', { displayName: 'น้องซี', lang: 'th', addFriend: true })
    expect(again.status).toBe(200)
    expect(again.body.farm.id).toBe(farm.id)
    const second = await as('Usecond', repos).post('/invites/K7P2QX/accept', { displayName: 'น้องดี', lang: 'th', addFriend: true })
    expect(second.status).toBe(409)
    expect(repos.state.members.filter((m) => m.farmId === farm.id && m.status === 'active')).toHaveLength(3)
  })

  it('a double tap joins once', async () => {
    const repos = seeded({ invites: [invite()] })
    const body = { displayName: 'น้องซี', lang: 'th', addFriend: true }
    const [a, b] = await Promise.all([as(NEW, repos).post('/invites/K7P2QX/accept', body), as(NEW, repos).post('/invites/K7P2QX/accept', body)])
    expect([a.status, b.status]).toEqual([200, 200])
    expect(repos.state.members.filter((m) => m.lineUserId === NEW)).toHaveLength(1)
  })

  it('a person with a farm in น้องน้ำ is sent there, and nothing is written', async () => {
    const repos = seeded({ invites: [invite()] })
    expect((await as(NONG_NAM, repos).get('/invites/K7P2QX')).body).toEqual({ error: 'use_nong_nam' })
    const res = await as(NONG_NAM, repos).post('/invites/K7P2QX/accept', { displayName: 'พี่ใหญ่', lang: 'th', addFriend: true })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'use_nong_nam' })
    expect(repos.state.invites[0]!.status).toBe('pending')
    expect(repos.state.members.filter((m) => m.lineUserId === NONG_NAM)).toHaveLength(1)
    expect(repos.state.lineUsers).toEqual([])
  })

  it('someone already in another OA farm is refused, the invite kept', async () => {
    const other: FarmRow = { ...farm, id: 'farm-oa2', createdBy: 'Uother' }
    const repos = seeded({
      farms: [farm, nongNamFarm, other],
      members: [owner, worker, { id: 'm-o', farmId: other.id, lineUserId: 'Uother', role: 'owner', name: 'พี่โอ', pondIds: [], status: 'active' }],
      invites: [invite()],
    })
    const res = await as('Uother', repos).post('/invites/K7P2QX/accept', { displayName: 'พี่โอ', lang: 'th', addFriend: true })
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'already_has_farm' })
    expect(repos.state.invites[0]!.status).toBe('pending')
  })

  it('a name too long is 400', async () => {
    const res = await as(NEW, seeded({ invites: [invite()] })).post('/invites/K7P2QX/accept', { displayName: 'ก'.repeat(81), lang: 'th', addFriend: true })
    expect(res.status).toBe(400)
  })
})

describe('a person’s ponds', () => {
  it('lists every pond with who holds it now', async () => {
    const res = await as(OWNER, seeded({ members: [owner, worker, manager] })).get('/members/m-worker/ponds')
    expect(res.status).toBe(200)
    expect(res.body.pondIds).toEqual(['p1', 'p2'])
    expect(res.body.ponds).toEqual([
      { id: 'p1', code: 'A01', zone: 'A', heldBy: null },
      { id: 'p2', code: 'A02', zone: 'A', heldBy: null },
      { id: 'p3', code: 'B01', zone: 'B', heldBy: 'พี่บี' },
    ])
    expect(res.body.member).toMatchObject({ id: 'm-worker', scope: 'ดูแล 2 บ่อ · วันนี้ 0/2' })
  })

  it('a pond given to one person leaves the other', async () => {
    const repos = seeded({ members: [owner, worker, manager] })
    const res = await as(OWNER, repos).put('/members/m-worker/ponds', { pondIds: ['p3', 'p2', 'elsewhere'] })
    expect(res.status).toBe(200)
    expect(res.body.pondIds).toEqual(['p2', 'p3'])
    expect(repos.state.members.find((m) => m.id === 'm-worker')!.pondIds).toEqual(['p2', 'p3'])
    expect(repos.state.members.find((m) => m.id === 'm-manager')!.pondIds).toEqual([])
  })

  it('only the owner, never on the owner, never someone outside the farm', async () => {
    const repos = seeded()
    expect((await as(WORKER, repos).get('/members/m-worker/ponds')).status).toBe(403)
    expect((await as(OWNER, repos).get('/members/m-owner/ponds')).status).toBe(403)
    expect((await as(OWNER, repos).get('/members/m-nn/ponds')).status).toBe(404)
    expect((await as(OWNER, repos).put('/members/m-worker/ponds', { pondIds: 'p1' })).status).toBe(400)
  })
})

describe('permissions', () => {
  it('a switch the owner changes is kept, and the person’s session follows it', async () => {
    const repos = seeded({ members: [owner, worker, manager] })
    const got = await as(OWNER, repos).get('/members/m-manager/permissions')
    expect(got.body).toMatchObject({ pondsLabel: 'B01', perms: DEFAULTS.manager, defaults: DEFAULTS.manager })
    const res = await as(OWNER, repos).patch('/members/m-manager/permissions', { key: 'printSheet', value: false })
    expect(res.status).toBe(200)
    expect(res.body.perms).toEqual({ ...DEFAULTS.manager, printSheet: false })
    expect((await as(MANAGER, repos).get('/session')).body.permissions.printSheet).toBe(false)
    expect((await as(MANAGER, repos).get('/print/farm')).status).toBe(403)
  })

  it('a worker never gets a size key, whatever is switched', async () => {
    const repos = seeded()
    const res = await as(OWNER, repos).patch('/members/m-worker/permissions', { key: 'farmOverview', value: true })
    expect(res.body.perms.farmOverview).toBe(false)
    expect((await as(WORKER, repos).get('/overview')).status).toBe(403)
  })

  it('reset and a new role bring the role’s defaults back', async () => {
    const repos = seeded()
    await as(OWNER, repos).patch('/members/m-worker/permissions', { key: 'remindMissing', value: false }).expect(200)
    const reset = await as(OWNER, repos).patch('/members/m-worker/permissions', { reset: true })
    expect(reset.body.perms).toEqual(DEFAULTS.worker)
    await as(OWNER, repos).patch('/members/m-worker/permissions', { key: 'remindMissing', value: false }).expect(200)
    const role = await as(OWNER, repos).patch('/members/m-worker/permissions', { role: 'manager' })
    expect(role.body).toMatchObject({ member: { role: 'manager' }, perms: DEFAULTS.manager, defaults: DEFAULTS.manager })
    expect((repos.state.settings[farm.id] as { perms: object }).perms).toEqual({})
  })

  it('a bad body is 400; the owner’s own switches cannot be changed', async () => {
    const repos = seeded()
    expect((await as(OWNER, repos).patch('/members/m-worker/permissions', { key: 'nope', value: true })).status).toBe(400)
    expect((await as(OWNER, repos).patch('/members/m-worker/permissions', { key: 'printSheet', value: 'yes' })).status).toBe(400)
    expect((await as(OWNER, repos).patch('/members/m-worker/permissions', {})).status).toBe(400)
    expect((await as(OWNER, repos).patch('/members/m-owner/permissions', { reset: true })).status).toBe(403)
  })
})

describe('role and removal', () => {
  it('the owner changes a role; a removed person has no farm here any more', async () => {
    const repos = seeded()
    await as(OWNER, repos).patch('/members/m-worker', { role: 'manager' }).expect(204)
    expect(repos.state.members.find((m) => m.id === 'm-worker')!.role).toBe('manager')
    await as(OWNER, repos).del('/members/m-worker').expect(204)
    expect(repos.state.members.find((m) => m.id === 'm-worker')).toMatchObject({ status: 'removed', pondIds: [] })
    const session = await as(WORKER, repos).get('/session')
    expect(session.status).toBe(200)
    expect(session.body.farm).toBeNull()
  })

  it('not the owner, not on the owner, and only a real role', async () => {
    const repos = seeded()
    expect((await as(WORKER, repos).del('/members/m-worker')).status).toBe(403)
    expect((await as(OWNER, repos).del('/members/m-owner')).status).toBe(403)
    expect((await as(OWNER, repos).patch('/members/m-worker', { role: 'owner' })).status).toBe(400)
    expect((await as(OWNER, repos).del('/members/missing')).status).toBe(404)
  })
})
