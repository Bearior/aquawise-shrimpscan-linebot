import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scan } from '../../contract/types.js'
import { createApp } from '../../app.js'
import { createMemoryRepos, type MemoryRepos, type MemoryState } from '../../data/memory.js'
import type { FarmRow, MemberRow, NetRow, PondRow } from '../../data/types.js'
import { CENTRED_RING, ringToPoints } from '../../domain/rim-geometry.js'
import type { SizingClient, SizingRing, SizingRimResponse } from '../../lib/sizing.js'

const YOR = readFileSync(fileURLToPath(new URL('../../../liff-app/dev-mock/fixtures/yor.jpg', import.meta.url)))

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
const RING: SizingRing = [0.5, 0.52, 0.38, 0.33, 0]
const FOUND: SizingRimResponse = { found: true, ring: RING, source: 'M1', confidence: 0.91, working_px: [520, 461], pipeline_version: 'p1' }

function stubSizing(rim: SizingRimResponse | null = FOUND): SizingClient {
  return {
    detectRim: vi.fn(async () => (rim ? { ok: true as const, data: rim } : { ok: false as const, code: 'NOT_CONFIGURED' as const })),
    measure: vi.fn(async () => ({ ok: false as const, code: 'NOT_CONFIGURED' as const })),
  }
}

function as(who: string, repos: MemoryRepos, sizing: SizingClient = stubSizing()) {
  process.env.LIFF_DEV_USER_ID = who
  const app = createApp({ repos, sizing })
  const auth = { authorization: 'Bearer dev-liff' }
  return {
    upload: (pondId: string, body: Buffer | string, type = 'image/jpeg') =>
      request(app).post(`/api/liff/scans?pondId=${encodeURIComponent(pondId)}`).set(auth).set('Content-Type', type).send(body),
    get: (p: string) => request(app).get(`/api/liff${p}`).set(auth),
  }
}

const farm: FarmRow = { id: 'farm-oa', name: 'ฟาร์มสายน้ำ', createdBy: OWNER, createdVia: 'shrimp_scan_oa', accessLevel: 'scan_only' }
const other: FarmRow = { ...farm, id: 'farm-other', createdBy: 'Uother' }
const members: MemberRow[] = [
  { id: 'm-owner', farmId: farm.id, lineUserId: OWNER, role: 'owner', name: 'พี่วิชัย', pondIds: [], status: 'active' },
  { id: 'm-worker', farmId: farm.id, lineUserId: WORKER, role: 'worker', name: 'น้องเอ', pondIds: ['p1'], status: 'active' },
]
const ponds: PondRow[] = [
  { id: 'p1', farmId: farm.id, code: 'E01', netId: null },
  { id: 'p2', farmId: farm.id, code: 'E02', netId: null },
  { id: 'px', farmId: other.id, code: 'E01', netId: null },
]
const nets: NetRow[] = [{ id: 'net-82', farmId: farm.id, cm: 82, createdBy: OWNER, createdAt: '2026-10-20T03:00:00Z', archivedAt: null }]

const seeded = (extra: Partial<MemoryState> = {}) => createMemoryRepos({ farms: [farm, other], members, ponds, nets, ...extra })

function nothingWritten(repos: MemoryRepos) {
  expect(repos.state.scans).toHaveLength(0)
  expect(Object.keys(repos.state.objects)).toHaveLength(0)
  expect(repos.state.imageFiles).toHaveLength(0)
}

describe('POST /scans', () => {
  it('a body that is not a photo is 415 before anything is written', async () => {
    const repos = seeded()
    const sizing = stubSizing()
    const plain = await as(OWNER, repos, sizing).upload('p1', 'hello', 'text/plain')
    expect(plain.status).toBe(415)
    expect(plain.body).toEqual({ error: 'unsupported_type' })
    const fake = await as(OWNER, repos, sizing).upload('p1', Buffer.from('not a jpeg at all'), 'image/jpeg')
    expect(fake.status).toBe(415)
    nothingWritten(repos)
    expect(sizing.detectRim).not.toHaveBeenCalled()
  })

  it('a photo over 12 MB is 413 before anything is written', async () => {
    const repos = seeded()
    const big = Buffer.concat([YOR, Buffer.alloc(13 * 1024 * 1024)])
    const res = await as(OWNER, repos).upload('p1', big)
    expect(res.status).toBe(413)
    expect(res.body).toEqual({ error: 'too_large' })
    nothingWritten(repos)
  })

  it('a pond of another farm is 404', async () => {
    const repos = seeded()
    expect((await as(OWNER, repos).upload('px', YOR)).status).toBe(404)
    expect((await as(OWNER, repos).upload('nope', YOR)).status).toBe(404)
    nothingWritten(repos)
  })

  it('a good photo is stored, filed and waits for its rim, with น้ำ’s guess', async () => {
    const repos = seeded()
    const sizing = stubSizing()
    const res = await as(OWNER, repos, sizing).upload('p1', YOR)
    expect(res.status).toBe(200)
    const scan = res.body.scan as Scan
    expect(scan).toMatchObject({ pondId: 'p1', pondCode: 'E01', width: 520, height: 461, status: 'waiting', result: null, found: null, photoBy: 'พี่วิชัย', canFix: false })
    expect(scan.photoUrl).toMatch(/^https:\/\/photos\.test\//)
    expect(scan.net).toMatchObject({ id: 'net-82', cm: 82, isFarmDefault: true })
    const want = ringToPoints(RING, 520, 461)
    scan.rimGuess.forEach((p, i) => {
      expect(p.x).toBeCloseTo(want[i]!.x, 5)
      expect(p.y).toBeCloseTo(want[i]!.y, 5)
    })

    expect(sizing.detectRim).toHaveBeenCalledTimes(1)
    const [row] = repos.state.scans
    expect(row).toMatchObject({ id: scan.id, farmId: farm.id, pondId: 'p1', lineUserId: OWNER, status: 'queued', sampleDate: null })
    expect(row!.sha256).toMatch(/^[0-9a-f]{64}$/)
    const path = `shrimp-scan/${farm.id}/${scan.id}.jpg`
    expect(repos.state.objects[path]).toEqual({ mime: 'image/jpeg', bytes: YOR.length })
    expect(repos.state.imageFiles).toEqual([
      expect.objectContaining({ id: row!.imageFileId, farmId: farm.id, lineUserId: OWNER, ref: path, kind: 'shrimp_scan', mime: 'image/jpeg', bytes: YOR.length, pondIds: ['p1'] }),
    ])
  })

  it('no rim found, or no measuring service, starts from the centred guess', async () => {
    for (const sizing of [stubSizing({ ...FOUND, found: false, ring: null }), stubSizing(null)]) {
      const res = await as(OWNER, seeded(), sizing).upload('p1', YOR)
      expect(res.status).toBe(200)
      expect((res.body.scan as Scan).rimGuess).toEqual(CENTRED_RING)
    }
  })

  it('a farm with no ยอ yet has no net on the scan', async () => {
    const res = await as(OWNER, seeded({ nets: [] })).upload('p1', YOR)
    expect((res.body.scan as Scan).net).toBeNull()
  })

  it('a worker scans only the ponds they look after', async () => {
    const repos = seeded()
    const res = await as(WORKER, repos).upload('p2', YOR)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'not_allowed' })
    nothingWritten(repos)
    const mine = await as(WORKER, repos).upload('p1', YOR)
    expect(mine.status).toBe(200)
    expect((mine.body.scan as Scan).photoBy).toBe('น้องเอ')
  })

  it('the same photo sent again into the same pond is the same scan; into another pond it is refused', async () => {
    const repos = seeded()
    const a = as(OWNER, repos)
    const first = await a.upload('p1', YOR)
    const again = await a.upload('p1', YOR)
    expect(again.status).toBe(200)
    expect(again.body.scan.id).toBe(first.body.scan.id)
    const elsewhere = await a.upload('p2', YOR)
    expect(elsewhere.status).toBe(409)
    expect(elsewhere.body).toEqual({ error: 'same_photo' })
    expect(repos.state.scans).toHaveLength(1)
    expect(repos.state.imageFiles).toHaveLength(1)
  })

  it('a photo the store could not keep leaves no scan behind, so sending it again works', async () => {
    const repos = seeded({ failPhotoPut: true })
    const res = await as(OWNER, repos).upload('p1', YOR)
    expect(res.status).toBe(500)
    nothingWritten(repos)
    repos.state.failPhotoPut = false
    expect((await as(OWNER, repos).upload('p1', YOR)).status).toBe(200)
  })
})

describe('GET /scans/:id', () => {
  it('answers the scan to the farm, and nothing to another farm', async () => {
    const repos = seeded()
    const made = (await as(OWNER, repos).upload('p1', YOR)).body.scan as Scan
    const got = await as(WORKER, repos).get(`/scans/${made.id}`)
    expect(got.status).toBe(200)
    expect(got.body).toMatchObject({ id: made.id, width: 520, height: 461, rimGuess: made.rimGuess, result: null })
    repos.state.members.push({ id: 'm-x', farmId: other.id, lineUserId: 'Uother', role: 'owner', name: 'x', pondIds: [], status: 'active' })
    expect((await as('Uother', repos).get(`/scans/${made.id}`)).status).toBe(404)
    expect((await as(OWNER, repos).get('/scans/nope')).status).toBe(404)
  })
})
