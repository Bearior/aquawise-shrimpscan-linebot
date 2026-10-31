/**
 * The whole app, one day of it, through the real routes (Bear, 2026-10-31:
 * "ลองรันเทสต์ทั้งระบบหน่อย"). Every call `liff-app/src/api/client.ts` makes,
 * in the order people make them: the owner sets the farm up, scans, invites,
 * hands out ponds, reads every page and prints; the manager and the worker
 * read what they may; a new person passes the gate, makes a farm, and someone
 * else takes an invite. Only the sizing service is a stand-in.
 *
 * It fails on any 5xx but the three routes still not built, and on any
 * refusal the owner meets. Each route's own file tests what it answers.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pt, Scan } from '../../contract/types.js'
import { createApp } from '../../app.js'
import { createMemoryRepos, type MemoryRepos } from '../../data/memory.js'
import { UNMEASURED, type FarmRow, type MemberRow, type NetRow, type PondRow, type ScanRow } from '../../data/types.js'
import { addDays, bangkokDay } from '../../domain/farm.js'
import type { SizingClient, SizingMeasureResponse, SizingRimResponse } from '../../lib/sizing.js'

const YOR = readFileSync(fileURLToPath(new URL('../../../liff-app/dev-mock/fixtures/yor.jpg', import.meta.url)))

const KEYS = ['ALLOW_DEV_LIFF_AUTH', 'LIFF_DEV_USER_ID', 'K_SERVICE', 'NODE_ENV', 'SUPABASE_URL', 'LIFF_ID', 'BETA_ACCESS_CODE'] as const
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
const MANAGER = 'Umanager'
const WORKER = 'Uworker'
const NEW = 'Unew'
const JOINER = 'Ujoiner'

const farm: FarmRow = { id: 'farm-oa', name: 'ฟาร์มสายน้ำ', createdBy: OWNER, createdVia: 'shrimp_scan_oa', accessLevel: 'scan_only' }
const members: MemberRow[] = [
  { id: 'm-owner', farmId: farm.id, lineUserId: OWNER, role: 'owner', name: 'พี่วิชัย', pondIds: [], status: 'active' },
  { id: 'm-manager', farmId: farm.id, lineUserId: MANAGER, role: 'manager', name: 'น้าศักดิ์', pondIds: ['p2'], status: 'active' },
  { id: 'm-worker', farmId: farm.id, lineUserId: WORKER, role: 'worker', name: 'ช่างเอก', pondIds: ['p1'], status: 'active' },
]
const ponds: PondRow[] = [
  { id: 'p1', farmId: farm.id, code: 'A01', netId: null },
  { id: 'p2', farmId: farm.id, code: 'A02', netId: null },
  { id: 'p3', farmId: farm.id, code: 'B01', netId: null },
]
const nets: NetRow[] = [{ id: 'net-82', farmId: farm.id, cm: 82, createdBy: OWNER, createdAt: '2026-10-20T03:00:00Z', archivedAt: null }]

/** B01 grew 0.1 g a day for three days, today included: slow, so เรื่องน่าจับตา has an item to รับทราบ. */
function history(): ScanRow[] {
  const today = bangkokDay(new Date())
  return [2, 1, 0].map((back, i) => {
    const day = addDays(today, -back)
    const abw = 10 + i * 0.1
    return {
      id: `h${i}`, farmId: farm.id, pondId: 'p3', lineUserId: WORKER, status: 'ok', sampleDate: day,
      measuredAt: `${day}T01:00:00.000Z`, createdAt: `${day}T00:59:00.000Z`,
      abw, perKg: Math.round(1000 / abw), cv: 0.1, n: 60, flags: [], imageFileId: `img-h${i}`, netId: null, rim: null, ...UNMEASURED,
    }
  })
}

const MEASURED: SizingMeasureResponse = {
  run_id: null, status: 'ok', retake_reason: null, error_code: null, pipeline_version: 'p2', diameter_provisional: false,
  flags: [], px_lengths: [230, 220, 225], rim_radius_px: 400, sam3_calls: 2, sam3_http_attempts: 2,
  estimate: { abw_g: 13.9, range_g: [12.1, 15.2], range_kind: 'p10_p90', shrimp_per_kg: 72, n: 3, mean_length_cm: 12.2, cv_pct: 18 },
  shrimp: [
    { id: 1, x: 0.4, y: 0.5, length_cm: 12, weight_g: 13.2, confidence: 0.9, source: 'sam3' },
    { id: 2, x: 0.5, y: 0.5, length_cm: 12.5, weight_g: 14.9, confidence: 0.9, source: 'sam3' },
    { id: 3, x: 0.6, y: 0.55, length_cm: 12.2, weight_g: 13.6, confidence: 0.9, source: 'sam3' },
  ],
  tray: { diameter_cm: 82, canvas_px: 800, ellipse: { cx: 0.5, cy: 0.52, a: 0.38, b: 0.33, theta: 0 } },
  versions: { pipeline: 'p2' },
}
const RIM_FOUND: SizingRimResponse = { found: true, ring: [0.5, 0.52, 0.38, 0.33, 0], source: 'M1', confidence: 0.9, working_px: [520, 461], pipeline_version: 'p1' }
const sizing = (): SizingClient => ({
  detectRim: vi.fn(async () => ({ ok: true as const, data: RIM_FOUND })),
  measure: vi.fn(async () => ({ ok: true as const, data: MEASURED })),
})

interface Hit {
  who: string
  call: string
  status: number
  error?: string
}

function day(repos: MemoryRepos) {
  const app = createApp({ repos, sizing: sizing() })
  const hits: Hit[] = []
  const go = async (who: string, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, body?: unknown) => {
    process.env.LIFF_DEV_USER_ID = who
    let req = request(app)[method](`/api/liff${path}`).set({ authorization: 'Bearer dev-liff' })
    if (body !== undefined) req = req.send(body as object)
    const res = await req
    hits.push({ who, call: `${method.toUpperCase()} ${path}`, status: res.status, ...(res.status >= 400 ? { error: res.body?.error } : {}) })
    return res
  }
  const upload = async (who: string, pondId: string, photo = YOR) => {
    process.env.LIFF_DEV_USER_ID = who
    const res = await request(app).post(`/api/liff/scans?pondId=${pondId}`).set({ authorization: 'Bearer dev-liff' }).set('Content-Type', 'image/jpeg').send(photo)
    hits.push({ who, call: 'POST /scans', status: res.status, ...(res.status >= 400 ? { error: res.body?.error } : {}) })
    return res
  }
  return { go, upload, hits }
}

describe('one day of the whole app', () => {
  it('answers every call the app makes, for every role, with no server error', async () => {
    const repos = createMemoryRepos({ farms: [farm], members, ponds, nets, scans: history() })
    const { go, upload, hits } = day(repos)
    const today = bangkokDay(new Date())

    // The owner: the farm, its ponds and zones, the ยอ.
    await go(OWNER, 'get', '/session')
    await go(OWNER, 'get', '/me')
    await go(OWNER, 'patch', '/farm', { targetPerKg: 45 })
    await go(OWNER, 'get', '/ponds')
    await go(OWNER, 'post', '/ponds', { codes: ['A03', 'C01'] })
    await go(OWNER, 'patch', '/ponds/p2', { code: 'A02หน้า' })
    await go(OWNER, 'put', '/zones/A', { name: 'หน้าบ้าน' })
    await go(OWNER, 'get', '/ponds/p1')
    await go(OWNER, 'get', '/ponds/p1/scans')
    await go(OWNER, 'get', '/ponds/p1/stocking')
    await go(OWNER, 'put', '/ponds/p1/stocking', { stockedOn: today, count: 200_000, survival: 0.8 })
    await go(OWNER, 'get', '/nets')
    const net = await go(OWNER, 'post', '/nets', { shape: 'round', cm: 75 })
    await go(OWNER, 'patch', `/nets/${net.body.id}`, { cm: 76 })
    await go(OWNER, 'put', '/ponds/p3/net', { netId: net.body.id })

    // The owner scans A01 the whole way: photo, rim, measure, another ยอ, save, then a fix.
    const up = await upload(OWNER, 'p1')
    const scan = up.body.scan as Scan
    await go(OWNER, 'get', `/scans/${scan.id}`)
    const rim: Pt[] = scan.rimGuess
    await go(OWNER, 'post', `/scans/${scan.id}/measure`, { rim, netId: 'net-82' })
    await go(OWNER, 'post', `/scans/${scan.id}/net`, { netId: 'net-82' })
    await go(OWNER, 'post', `/scans/${scan.id}/save`, {})
    await go(OWNER, 'post', `/scans/${scan.id}/fix`, { rim })
    await go(OWNER, 'post', `/scans/${scan.id}/fix/apply`, { use: 'new', rim })

    // Every owner page.
    const o = await go(OWNER, 'get', '/overview')
    // Only an item marked ackable has รับทราบ (ยังไม่สแกน leaves by being done).
    const watch = ((o.body.watch ?? []) as { key: string; signature: string; ackable: boolean }[]).find((w) => w.ackable)
    if (watch) {
      await go(OWNER, 'put', `/watch/${encodeURIComponent(watch.key)}/ack`, { signature: watch.signature })
      await go(OWNER, 'delete', `/watch/${encodeURIComponent(watch.key)}/ack`)
    }
    await go(OWNER, 'get', '/today')
    await go(OWNER, 'get', '/team/today')
    await go(OWNER, 'get', '/members')
    await go(OWNER, 'get', '/members/m-worker/ponds')
    await go(OWNER, 'put', '/members/m-worker/ponds', { pondIds: ['p1', 'p3'] })
    await go(OWNER, 'get', '/members/m-worker/permissions')
    await go(OWNER, 'patch', '/members/m-manager/permissions', { key: 'printSheet', value: false })
    await go(OWNER, 'patch', '/members/m-manager/permissions', { reset: true })
    await go(OWNER, 'get', '/settings')
    await go(OWNER, 'patch', '/settings', { notify: { morningSheet: true } })
    await go(OWNER, 'get', '/print/farm')
    await go(OWNER, 'get', '/print/pond/p1')
    const inv = await go(OWNER, 'post', '/invites', { role: 'worker', pondIds: ['p3'] })
    const drop = await go(OWNER, 'post', '/invites', { role: 'manager', pondIds: [] })
    await go(OWNER, 'delete', `/invites/${drop.body.code}`)

    // The manager and the worker, on what they open.
    for (const who of [MANAGER, WORKER]) {
      await go(who, 'get', '/session')
      await go(who, 'get', '/today')
    }
    await go(MANAGER, 'get', '/overview')
    await go(MANAGER, 'get', '/ponds')
    await go(MANAGER, 'get', '/team/today')
    await go(MANAGER, 'get', '/members')
    await go(WORKER, 'get', '/nets')
    // Another photo: the same one twice is refused (same_photo), by design.
    const wup = await upload(WORKER, 'p1', Buffer.concat([YOR, Buffer.from([0])]))
    const ws = wup.body.scan as Scan
    await go(WORKER, 'post', `/scans/${ws.id}/measure`, { rim: ws.rimGuess, netId: 'net-82' })
    await go(WORKER, 'post', `/scans/${ws.id}/save`, { notes: ['กินดี'] })

    // Someone invited takes the invite; a new person passes the gate and makes a farm.
    await go(JOINER, 'get', `/invites/${inv.body.code}`)
    await go(JOINER, 'post', `/invites/${inv.body.code}/accept`, { displayName: 'น้องบี', lang: 'th', addFriend: false })
    await go(JOINER, 'get', '/session')
    await go(NEW, 'get', '/session')
    await go(NEW, 'post', '/gate', { code: 'ANY' })
    await go(NEW, 'post', '/start', { name: 'ฟาร์มใหม่', ponds: ['A01', 'A02', 'B01'], zoneNames: { B: 'หลังบ้าน' } })
    await go(NEW, 'get', '/overview')

    // The owner removes the manager last.
    await go(OWNER, 'patch', '/members/m-worker', { role: 'manager' })
    await go(OWNER, 'delete', '/members/m-manager')

    // Still 501 by design: the inbox (out of the nav) and sending a sheet into the chat.
    await go(OWNER, 'get', '/inbox')
    await go(OWNER, 'post', `/inbox/${scan.id}/ask-again`, { reason: 'blurry' })
    await go(OWNER, 'post', '/print/send', { sheet: 'farm' })

    const broken = hits.filter((h) => h.status >= 500 && h.status !== 501)
    expect(broken, JSON.stringify(broken)).toEqual([])
    expect(hits.filter((h) => h.status === 501).map((h) => h.call)).toEqual(['GET /inbox', `POST /inbox/${scan.id}/ask-again`, 'POST /print/send'])
    const refused = hits.filter((h) => h.status >= 400 && h.status < 500)
    expect(refused, JSON.stringify(refused)).toEqual([])
    expect(watch, 'the day should hold one item to acknowledge').toBeDefined()
    expect(hits.length).toBeGreaterThan(55)
  })

  it('keeps the worker off every owner page and every write, and the manager off the owner’s writes', async () => {
    const repos = createMemoryRepos({ farms: [farm], members, ponds, nets })
    const { go, hits } = day(repos)
    for (const [m, p, b] of [
      ['get', '/overview'],
      // Their own pond reads (seePonds); someone else's pond and the stocking page do not.
      ['get', '/ponds/p2'],
      ['get', '/ponds/p2/scans'],
      ['get', '/ponds/p1/stocking'],
      ['put', '/ponds/p1/stocking', { stockedOn: null, count: null, survival: null }],
      ['get', '/team/today'],
      ['get', '/print/farm'],
      ['post', '/ponds', { codes: ['A09'] }],
      ['patch', '/ponds/p1', { code: 'A09' }],
      ['put', '/zones/A', { name: 'x' }],
      ['patch', '/farm', { targetPerKg: 30 }],
      ['post', '/invites', { role: 'worker', pondIds: [] }],
      ['put', '/members/m-worker/ponds', { pondIds: [] }],
      ['patch', '/settings', { notify: { photoIn: false } }],
    ] as const) await go(WORKER, m, p, b)
    expect(hits.filter((h) => h.status !== 403)).toEqual([])
    hits.length = 0
    for (const p of ['/ponds', '/ponds/p1', '/ponds/p1/scans']) await go(WORKER, 'get', p)
    expect(hits.filter((h) => h.status !== 200)).toEqual([])
    hits.length = 0
    for (const [m, p, b] of [
      ['post', '/ponds', { codes: ['A09'] }],
      ['patch', '/ponds/p1', { code: 'A09' }],
      ['put', '/zones/A', { name: 'x' }],
      ['patch', '/farm', { targetPerKg: 30 }],
    ] as const) await go(MANAGER, m, p, b)
    expect(hits.filter((h) => h.status !== 403)).toEqual([])
  })
})
