import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MeasureRequest, Scan, ScanResult } from '../../contract/types.js'
import { createApp } from '../../app.js'
import { createMemoryRepos, type MemoryRepos, type MemoryState } from '../../data/memory.js'
import { UNMEASURED, type FarmRow, type MemberRow, type NetRow, type PondRow, type ScanRow } from '../../data/types.js'
import { addDays, bangkokDay } from '../../domain/farm.js'
import { CENTRED_RING, ellipseToRing, pointsToEllipse, ringToPoints } from '../../domain/rim-geometry.js'
import { shrimpLenPx } from '../../domain/scan-view.js'
import type { SizingClient, SizingMeasureResponse, SizingRing, SizingRimResponse } from '../../lib/sizing.js'

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
    measure: (id: string, body: MeasureRequest | Record<string, unknown>) => request(app).post(`/api/liff/scans/${id}/measure`).set(auth).send(body),
    net: (id: string, netId: string) => request(app).post(`/api/liff/scans/${id}/net`).set(auth).send({ netId }),
    save: (id: string, body: Record<string, unknown> = {}) => request(app).post(`/api/liff/scans/${id}/save`).set(auth).send(body),
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
    expect(repos.state.objects[path]).toMatchObject({ mime: 'image/jpeg', bytes: YOR.length })
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

/* ---------- Task 6: measure, change ยอ, save ---------- */

const SHRIMP = [
  { id: 1, x: 0.4, y: 0.5, length_cm: 12, weight_g: 13.2, confidence: 0.9, source: 'sam3' },
  { id: 2, x: 0.5, y: 0.5, length_cm: 12.5, weight_g: 14.9, confidence: 0.9, source: 'sam3' },
  { id: 3, x: 0.6, y: 0.55, length_cm: 12.2, weight_g: 13.6, confidence: 0.9, source: 'sam3' },
]
const TRAY_RING: SizingRing = [0.5, 0.52, 0.38, 0.33, 0]
const RIM = ringToPoints(RING, 520, 461)

function answer(over: Partial<SizingMeasureResponse> = {}): SizingMeasureResponse {
  return {
    run_id: null, status: 'ok', retake_reason: null, error_code: null, pipeline_version: 'p2', diameter_provisional: false,
    flags: ['colour_rim'], px_lengths: [230, 220, 225, 90], rim_radius_px: 400, sam3_calls: 2, sam3_http_attempts: 2,
    estimate: { abw_g: 13.9, range_g: [12.1, 15.2], range_kind: 'p10_p90', shrimp_per_kg: 72, n: 3, mean_length_cm: 12.2, cv_pct: 18 },
    shrimp: SHRIMP,
    tray: { diameter_cm: 82, canvas_px: 800, ellipse: { cx: 0.5, cy: 0.52, a: 0.38, b: 0.33, theta: 0 } },
    versions: { pipeline: 'p2' },
    ...over,
  }
}
const RETAKE: SizingMeasureResponse = {
  run_id: null, status: 'retake', retake_reason: 'no_rim', error_code: null, pipeline_version: 'p2', diameter_provisional: false,
  flags: [], px_lengths: [], rim_radius_px: null, sam3_calls: 1, sam3_http_attempts: 1, versions: { pipeline: 'p2' },
}

type MeasureAnswer = Awaited<ReturnType<SizingClient['measure']>>
const OK: MeasureAnswer = { ok: true, data: answer() }

/** The service answers these in turn, then keeps answering the last. */
function sizingAnswering(...answers: MeasureAnswer[]): SizingClient {
  const s = stubSizing()
  let i = 0
  s.measure = vi.fn(async () => answers[Math.min(i++, answers.length - 1)]!)
  return s
}

async function uploaded(repos: MemoryRepos, who: string, sizing: SizingClient, photo: Buffer = YOR): Promise<string> {
  const res = await as(who, repos, sizing).upload('p1', photo)
  expect(res.status).toBe(200)
  return (res.body.scan as Scan).id
}

const rowOf = (repos: MemoryRepos, id: string) => repos.state.scans.find((s) => s.id === id)!

describe('POST /scans/:id/measure', () => {
  it('measures the photo on the rim and the ยอ, stores the result and takes one scan from today', async () => {
    const repos = seeded()
    const sizing = sizingAnswering(OK)
    const id = await uploaded(repos, OWNER, sizing)
    const res = await as(OWNER, repos, sizing).measure(id, { rim: RIM, netId: 'net-82' })
    expect(res.status).toBe(200)
    expect(res.body.creditsLeft).toBe(19)
    const scan = res.body.scan as Scan
    expect(scan).toMatchObject({ status: 'measured', measuredBy: 'พี่วิชัย', canFix: true })
    expect(scan.result).toMatchObject({ abw: 13.9, perKg: 72, count: 3, cv: 0.18, lengthCm: 12.2, remeasuresLeft: 3, previous: null })
    expect(scan.result!.net).toEqual({ id: 'net-82', shape: 'round', cm: 82 })
    expect(scan.result!.shrimp).toHaveLength(3)
    expect(scan.result!.rim).toEqual(ringToPoints(TRAY_RING, 520, 461))
    expect(scan.found).toHaveLength(3)

    const opts = vi.mocked(sizing.measure).mock.calls[0]![2]
    expect(opts).toMatchObject({ diameterCm: 82, runId: id })
    ellipseToRing(pointsToEllipse(RIM, 520, 461)!).forEach((v, i) => expect(opts.rimEllipse[i]).toBeCloseTo(v, 9))

    expect(rowOf(repos, id)).toMatchObject({
      status: 'ok', abw: 13.9, abwLo: 12.1, abwHi: 15.2, perKg: 72, cv: 0.18, n: 3, netId: 'net-82', refCm: 82,
      rimRadiusPx: 400, canvasPx: 800, rim: TRAY_RING, shrimpXy: [0.4, 0.5, 0.5, 0.5, 0.6, 0.55], lenPx: shrimpLenPx(SHRIMP, 400, 82),
      flags: ['size:520x461', 'colour_rim'], sampleDate: null,
    })
    expect(rowOf(repos, id).measuredAt).toEqual(expect.any(String))
    expect(repos.state.quotaUsed[farm.id]).toBe(1)

    // A later read says what the measure said.
    const again = await as(OWNER, repos, sizing).get(`/scans/${id}`)
    expect(again.body.result).toEqual(scan.result)
  })

  it('a worker measuring their own photo gets where the shrimp are and no number, by any door', async () => {
    const repos = seeded()
    const sizing = sizingAnswering(OK)
    const id = await uploaded(repos, WORKER, sizing)
    const res = await as(WORKER, repos, sizing).measure(id, { rim: RIM, netId: 'net-82' })
    expect(res.status).toBe(200)
    expect(res.body.scan).toMatchObject({ status: 'measured', result: null, canFix: false })
    expect(res.body.scan.found).toHaveLength(3)
    expect(JSON.stringify(res.body)).not.toMatch(/13\.9|"abw"|"perKg"/)
    const got = await as(WORKER, repos, sizing).get(`/scans/${id}`)
    expect(got.body.result).toBeNull()
    expect(JSON.stringify(got.body)).not.toMatch(/13\.9|"abw"|"perKg"/)
    // The owner sees the worker's numbers.
    expect((await as(OWNER, repos, sizing).get(`/scans/${id}`)).body.result).toMatchObject({ abw: 13.9 })
  })

  it('a photo the service asks to retake answers 422 with the reason; the scan is refunded and waits', async () => {
    const repos = seeded()
    const sizing = sizingAnswering({ ok: true, data: RETAKE })
    const id = await uploaded(repos, OWNER, sizing)
    const res = await as(OWNER, repos, sizing).measure(id, { rim: RIM, netId: 'net-82' })
    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'retake', reason: 'no_rim' })
    expect(repos.state.quotaUsed[farm.id]).toBe(0)
    expect(rowOf(repos, id)).toMatchObject({ status: 'retake', abw: null })
    expect((await as(OWNER, repos, sizing).get(`/scans/${id}`)).body).toMatchObject({ status: 'waiting', result: null, found: null })
  })

  it('a service that times out or fails answers 502 measure_failed, never a number; refunded, waiting again', async () => {
    const cases: [MeasureAnswer, string][] = [
      [{ ok: false, code: 'TIMEOUT' }, 'timeout'],
      [{ ok: false, code: 'ERROR', httpStatus: 500 }, 'service'],
      [{ ok: true, data: { ...RETAKE, status: 'error', retake_reason: null, error_code: 'sam3_timeout' } }, 'sam3_timeout'],
    ]
    for (const [failure, reason] of cases) {
      const repos = seeded()
      const sizing = sizingAnswering(failure)
      const id = await uploaded(repos, OWNER, sizing)
      const res = await as(OWNER, repos, sizing).measure(id, { rim: RIM, netId: 'net-82' })
      expect(res.status).toBe(502)
      expect(res.body).toEqual({ error: 'measure_failed', reason })
      expect(repos.state.quotaUsed[farm.id]).toBe(0)
      expect(rowOf(repos, id).abw).toBeNull()
      expect((await as(OWNER, repos, sizing).get(`/scans/${id}`)).body).toMatchObject({ status: 'waiting', result: null })
    }
  })

  it('no measuring service answers 503 measure_not_configured and refunds', async () => {
    const repos = seeded()
    const sizing = sizingAnswering({ ok: false, code: 'NOT_CONFIGURED' })
    const id = await uploaded(repos, OWNER, sizing)
    const res = await as(OWNER, repos, sizing).measure(id, { rim: RIM, netId: 'net-82' })
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'measure_not_configured' })
    expect(repos.state.quotaUsed[farm.id]).toBe(0)
    expect(rowOf(repos, id).status).toBe('queued')
  })

  it('no scans left today answers 402 no_credits, and the service is never called', async () => {
    const repos = seeded({ quotaUsed: { [farm.id]: 20 } })
    const sizing = sizingAnswering(OK)
    const id = await uploaded(repos, OWNER, sizing)
    const res = await as(OWNER, repos, sizing).measure(id, { rim: RIM, netId: 'net-82' })
    expect(res.status).toBe(402)
    expect(res.body).toEqual({ error: 'no_credits' })
    expect(sizing.measure).not.toHaveBeenCalled()
    expect(rowOf(repos, id).status).toBe('queued')
    expect(repos.state.quotaUsed[farm.id]).toBe(20)
  })

  it('a rim that makes no ring is 400 bad_rim, and a body that is not 4 points 400 bad_request, before any charge', async () => {
    const repos = seeded()
    const sizing = sizingAnswering(OK)
    const id = await uploaded(repos, OWNER, sizing)
    const a = as(OWNER, repos, sizing)
    const flat = await a.measure(id, { rim: [RIM[0], RIM[0], RIM[0], RIM[0]], netId: 'net-82' })
    expect(flat.status).toBe(400)
    expect(flat.body).toEqual({ error: 'bad_rim' })
    for (const rim of [RIM.slice(0, 3), [...RIM.slice(0, 3), { x: 1.4, y: 0.5 }], 'rim', [...RIM.slice(0, 3), { x: '0.5', y: 0.5 }]]) {
      const res = await a.measure(id, { rim, netId: 'net-82' })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'bad_request' })
    }
    expect(sizing.measure).not.toHaveBeenCalled()
    expect(repos.state.quotaUsed[farm.id] ?? 0).toBe(0)
  })

  it('three free re-measures of a photo, then 409 remeasure_limit; none of them takes a scan', async () => {
    const repos = seeded()
    const sizing = sizingAnswering(OK)
    const id = await uploaded(repos, OWNER, sizing)
    const a = as(OWNER, repos, sizing)
    expect((await a.measure(id, { rim: RIM, netId: 'net-82' })).body.scan.result.remeasuresLeft).toBe(3)
    for (const left of [2, 1, 0]) {
      const res = await a.measure(id, { rim: RIM, netId: 'net-82' })
      expect(res.status).toBe(200)
      expect(res.body.scan.result.remeasuresLeft).toBe(left)
      expect(res.body.creditsLeft).toBe(19)
    }
    const fourth = await a.measure(id, { rim: RIM, netId: 'net-82' })
    expect(fourth.status).toBe(409)
    expect(fourth.body).toEqual({ error: 'remeasure_limit' })
    expect(sizing.measure).toHaveBeenCalledTimes(4)
    expect(repos.state.quotaUsed[farm.id]).toBe(1)
    // Each call's SAM3 use is added, never written over (the spend trigger logs the change).
    expect(rowOf(repos, id)).toMatchObject({ sam3Calls: 8, sam3HttpAttempts: 8 })
  })

  it('a re-measure that fails keeps the paid result and its charge, and is used up', async () => {
    const repos = seeded()
    const sizing = sizingAnswering(OK, { ok: false, code: 'TIMEOUT' })
    const id = await uploaded(repos, OWNER, sizing)
    const a = as(OWNER, repos, sizing)
    await a.measure(id, { rim: RIM, netId: 'net-82' })
    const res = await a.measure(id, { rim: RIM, netId: 'net-82' })
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'measure_failed', reason: 'timeout' })
    // A timed-out call probably made its SAM3 calls: line-bot counts 3 attempts.
    expect(rowOf(repos, id)).toMatchObject({ status: 'ok', abw: 13.9, sam3Calls: 2, sam3HttpAttempts: 5 })
    expect(repos.state.quotaUsed[farm.id]).toBe(1)
    expect((await a.get(`/scans/${id}`)).body.result).toMatchObject({ abw: 13.9, remeasuresLeft: 2 })
  })

  it('the person who sent the photo measures it, or an owner; another worker may not', async () => {
    const repos = seeded()
    repos.state.members.push({ id: 'm-w2', farmId: farm.id, lineUserId: 'Uworker2', role: 'worker', name: 'น้องบี', pondIds: ['p1'], status: 'active' })
    const sizing = sizingAnswering(OK)
    const id = await uploaded(repos, WORKER, sizing)
    const res = await as('Uworker2', repos, sizing).measure(id, { rim: RIM, netId: 'net-82' })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'not_allowed' })
    expect(sizing.measure).not.toHaveBeenCalled()
    expect((await as(OWNER, repos, sizing).measure(id, { rim: RIM, netId: 'net-82' })).status).toBe(200)
  })

  it('a farm with no ยอ is 409 no_net; a ยอ id that is not the farm’s falls back to the pond’s', async () => {
    const none = seeded({ nets: [] })
    const sizing = sizingAnswering(OK)
    const id = await uploaded(none, OWNER, sizing)
    const res = await as(OWNER, none, sizing).measure(id, { rim: RIM, netId: '' })
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'no_net' })

    const repos = seeded()
    const id2 = await uploaded(repos, OWNER, sizing)
    expect((await as(OWNER, repos, sizing).measure(id2, { rim: RIM, netId: 'net-elsewhere' })).body.scan.result.net.id).toBe('net-82')
  })
})

describe('POST /scans/:id/net', () => {
  const nets2: NetRow[] = [...nets, { id: 'net-75', farmId: farm.id, cm: 75, createdBy: OWNER, createdAt: '2026-10-21T03:00:00Z', archivedAt: null }]

  it('measures the same photo and rim again on the other ยอ, free, and the pond keeps that ยอ', async () => {
    const repos = seeded({ nets: nets2 })
    const sizing = sizingAnswering(OK, { ok: true, data: answer({ estimate: { ...answer().estimate!, abw_g: 11.4, shrimp_per_kg: 88 } }) })
    const id = await uploaded(repos, OWNER, sizing)
    const a = as(OWNER, repos, sizing)
    await a.measure(id, { rim: RIM, netId: 'net-82' })
    const res = await a.net(id, 'net-75')
    expect(res.status).toBe(200)
    expect(res.body.creditsLeft).toBe(19)
    expect(res.body.scan.result).toMatchObject({ abw: 11.4, perKg: 88, net: { id: 'net-75', cm: 75 }, remeasuresLeft: 2 })
    const opts = vi.mocked(sizing.measure).mock.calls[1]![2]
    expect(opts.diameterCm).toBe(75)
    expect(opts.rimEllipse).toEqual(TRAY_RING)
    expect(rowOf(repos, id)).toMatchObject({ netId: 'net-75', refCm: 75 })
    expect(repos.state.ponds.find((p) => p.id === 'p1')!.netId).toBe('net-75')
    expect(repos.state.quotaUsed[farm.id]).toBe(1)
  })

  it('refused before a measure, to a worker, and for a ยอ the farm does not have', async () => {
    const repos = seeded({ nets: nets2 })
    const sizing = sizingAnswering(OK)
    const id = await uploaded(repos, WORKER, sizing)
    const early = await as(OWNER, repos, sizing).net(id, 'net-75')
    expect(early.status).toBe(409)
    expect(early.body).toEqual({ error: 'not_measured' })
    await as(WORKER, repos, sizing).measure(id, { rim: RIM, netId: 'net-82' })
    expect((await as(WORKER, repos, sizing).net(id, 'net-75')).status).toBe(403)
    expect((await as(OWNER, repos, sizing).net(id, 'net-nope')).status).toBe(404)
    expect(sizing.measure).toHaveBeenCalledTimes(1)
  })
})

describe('POST /scans/:id/save', () => {
  const today = bangkokDay()
  const earlier: ScanRow = {
    id: 'scan-old', farmId: farm.id, pondId: 'p1', lineUserId: OWNER, status: 'ok', sampleDate: addDays(today, -10),
    measuredAt: `${addDays(today, -10)}T03:00:00.000Z`, createdAt: `${addDays(today, -10)}T02:59:00.000Z`,
    abw: 8.9, perKg: 112, cv: 0.1, n: 60, flags: ['size:520x461'], imageFileId: 'img-old', netId: 'net-82', rim: null, ...UNMEASURED,
  }

  it('an owner’s save puts the scan in the pond today, with one growth row and the day it reaches size', async () => {
    const repos = seeded({ scans: [earlier] })
    const sizing = sizingAnswering(OK)
    const id = await uploaded(repos, OWNER, sizing)
    const a = as(OWNER, repos, sizing)
    await a.measure(id, { rim: RIM, netId: 'net-82' })
    const res = await a.save(id)
    expect(res.status).toBe(200)
    // 8.9 g ten days ago, 13.9 g today: 0.5 g a day to the default 40/kg (25 g) is 23 days.
    expect(res.body).toEqual({ pondId: 'p1', pondCode: 'E01', doneToday: 1, mineTotal: 2, reachOn: addDays(today, 23) })
    expect(rowOf(repos, id)).toMatchObject({ sampleDate: today, sampleDateSource: 'farmer' })
    expect(repos.state.growth).toEqual([
      { farmKey: OWNER, pondId: 'p1', day: today, source: 'lift_net_photo', cycleId: null, ageDays: null, abw: 13.9, lo: 12.1, hi: 15.2, n: 3, perKg: 72 },
    ])
    const got = await a.get(`/scans/${id}`)
    expect(got.body.status).toBe('saved')
    expect((got.body.result as ScanResult).previous).toEqual({ abw: 8.9, date: addDays(today, -10) })
  })

  it('a second save of the pond today replaces the first: one saved scan, one growth row with the newer number', async () => {
    const repos = seeded()
    const sizing = sizingAnswering(OK, { ok: true, data: answer({ estimate: { ...answer().estimate!, abw_g: 15, shrimp_per_kg: 67, range_g: [13, 17] } }) })
    const first = await uploaded(repos, OWNER, sizing)
    const a = as(OWNER, repos, sizing)
    await a.measure(first, { rim: RIM, netId: 'net-82' })
    await a.save(first)
    const second = await uploaded(repos, WORKER, sizing, Buffer.concat([YOR, Buffer.from([0])]))
    await as(WORKER, repos, sizing).measure(second, { rim: RIM, netId: 'net-82' })
    expect((await as(WORKER, repos, sizing).save(second)).status).toBe(200)
    expect(rowOf(repos, first).sampleDate).toBeNull()
    expect(rowOf(repos, second).sampleDate).toBe(today)
    expect(repos.state.growth).toHaveLength(1)
    expect(repos.state.growth[0]).toMatchObject({ farmKey: OWNER, pondId: 'p1', day: today, abw: 15, perKg: 67, n: 3 })
  })

  it('a worker’s save keeps their notes for the owner and says no date', async () => {
    const repos = seeded()
    const sizing = sizingAnswering(OK)
    const id = await uploaded(repos, WORKER, sizing)
    const w = as(WORKER, repos, sizing)
    await w.measure(id, { rim: RIM, netId: 'net-82' })
    for (const notes of ['กินดี', [1], ['x'.repeat(81)], Array.from({ length: 11 }, () => 'กินดี')]) {
      expect((await w.save(id, { notes })).status).toBe(400)
    }
    const res = await w.save(id, { notes: ['กินดี', ' ตัวนิ่ม ', ''] })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ pondId: 'p1', pondCode: 'E01', doneToday: 1, mineTotal: 1, reachOn: null })
    expect(rowOf(repos, id).flags).toEqual(['size:520x461', 'colour_rim', 'note:กินดี', 'note:ตัวนิ่ม'])
  })

  it('a scan that was not measured is not saved, and a saved one is not measured again', async () => {
    const repos = seeded()
    const sizing = sizingAnswering(OK)
    const id = await uploaded(repos, OWNER, sizing)
    const a = as(OWNER, repos, sizing)
    const early = await a.save(id)
    expect(early.status).toBe(409)
    expect(early.body).toEqual({ error: 'not_measured' })
    await a.measure(id, { rim: RIM, netId: 'net-82' })
    await a.save(id)
    const again = await a.measure(id, { rim: RIM, netId: 'net-82' })
    expect(again.status).toBe(409)
    expect(again.body).toEqual({ error: 'already_saved' })
    expect(sizing.measure).toHaveBeenCalledTimes(1)
  })
})
