/**
 * Measuring a scan's photo: POST /scans/:id/measure (MeasureRequest) and
 * POST /scans/:id/net ({ netId }), both answering MeasureResponse.
 *
 * The first measure of a photo is billed: the farm's daily quota is charged
 * (`sizing_consume_quota`) before the service is called and given back
 * (`sizing_refund_quota`) on anything but a result, so a failure never costs a
 * scan and never shows a number. Once the photo has its result it is measured
 * again for free, at most REMEASURES_MAX times (a rim moved, another ยอ), as
 * line-bot's adjust does: the paid result stands until a new one replaces it,
 * and an attempt that reached the service is used up even when it failed.
 *
 * A saved scan is not measured here again: its number is the pond's.
 * SAM3 use is only ever added to (line-bot addCosts), because the spend
 * trigger logs every change of it.
 */

import { Router } from 'express'
import type { MeasureResponse, Pt } from '../../contract/types.js'
import { ApiError, requireFarm } from '../../data/context.js'
import type { FarmRow, MemberRow, NetRow, Repos, ScanPatch, ScanRow } from '../../data/types.js'
import { scanDailyLimit } from '../../domain/farm.js'
import { pondNet } from '../../domain/nets.js'
import { ellipseToRing, pointsToEllipse } from '../../domain/rim-geometry.js'
import { mayMeasure, photoSizeOf, REMEASURE_FLAG, REMEASURES_MAX, remeasuresOf, shrimpLenPx } from '../../domain/scan-view.js'
import { imageInfo } from '../../lib/image-size.js'
import { logger } from '../../lib/logger.js'
import type { SizingClient, SizingImageType, SizingMeasureResponse, SizingResult, SizingRing } from '../../lib/sizing.js'
import { handle, type GetRepos } from './handle.js'
import { oneAtATime } from './lock.js'
import { scanView } from './scans.js'

/** line-bot TIMEOUT_ESTIMATED_CALLS: a measure that timed out probably made its calls. */
const TIMEOUT_ESTIMATED_ATTEMPTS = 3
const CANVAS_PX_MAX = 4096
const SHRIMP_XY_MAX_VALUES = 2000

const isPositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
const inUnit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1

/** Our own entries (size:, note:, fixed:, remeasure). The service's words are replaced by each measure. */
const isOwnFlag = (f: string) => f === REMEASURE_FLAG || f.includes(':')

/** The body's 4 rim points, each on the photo. */
function parseRim(body: unknown): Pt[] {
  const rim = (body as { rim?: unknown } | undefined)?.rim
  if (!Array.isArray(rim) || rim.length !== 4) throw new ApiError(400, 'bad_request')
  return rim.map((p: unknown) => {
    const { x, y } = (p ?? {}) as { x?: unknown; y?: unknown }
    if (!inUnit(x) || !inUnit(y)) throw new ApiError(400, 'bad_request')
    return { x, y }
  })
}

/* The service's geometry, kept only when it is what it says (line-bot measure.ts geometryPatch). */

function validRing(e: unknown): SizingRing | null {
  if (!e || typeof e !== 'object') return null
  const { cx, cy, a, b, theta } = e as Record<string, unknown>
  const v = [cx, cy, a, b, theta]
  if (!v.every((n) => typeof n === 'number' && Number.isFinite(n)) || !isPositive(a) || !isPositive(b)) return null
  return v as SizingRing
}

function validCanvasPx(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= CANVAS_PX_MAX ? v : null
}

function validShrimpXy(shrimp: unknown): number[] | null {
  if (!Array.isArray(shrimp) || shrimp.length === 0 || shrimp.length * 2 > SHRIMP_XY_MAX_VALUES) return null
  const flat: number[] = []
  for (const s of shrimp) {
    if (s === null || typeof s !== 'object') return null
    const { x, y } = s as { x?: unknown; y?: unknown }
    if (!inUnit(x) || !inUnit(y)) return null
    flat.push(x, y)
  }
  return flat
}

type Outcome = { ok: true; patch: ScanPatch } | { ok: false; error: ApiError; patch: ScanPatch; reached: boolean }

/** What the service's answer does to the row: a result, or why there is none (and then no number at all). */
function outcomeOf(result: SizingResult<SizingMeasureResponse>, row: ScanRow, net: NetRow, asked: SizingRing, again: boolean): Outcome {
  const own = row.flags.filter(isOwnFlag)
  const spent = (calls: number, attempts: number): ScanPatch => ({
    sam3Calls: (row.sam3Calls ?? 0) + calls,
    sam3HttpAttempts: (row.sam3HttpAttempts ?? 0) + attempts,
  })
  if (!result.ok) {
    if (result.code === 'NOT_CONFIGURED') return { ok: false, error: new ApiError(503, 'measure_not_configured'), patch: {}, reached: false }
    const timeout = result.code === 'TIMEOUT'
    return {
      ok: false,
      error: new ApiError(502, 'measure_failed', timeout ? 'timeout' : 'service'),
      patch: timeout ? spent(0, TIMEOUT_ESTIMATED_ATTEMPTS) : {},
      reached: true,
    }
  }
  const d = result.data
  const used = { ...spent(isPositive(d.sam3_calls) ? d.sam3_calls : 0, isPositive(d.sam3_http_attempts) ? d.sam3_http_attempts : 0), pipelineVersion: d.pipeline_version ?? null }
  if (d.status === 'retake') {
    const reason = d.retake_reason ?? 'retake'
    return { ok: false, error: new ApiError(422, 'retake', reason), patch: { ...used, status: 'retake', retakeReason: reason, flags: own }, reached: true }
  }
  if (d.status === 'error' && d.error_code === 'bad_ring') {
    // The service refused the ring itself: nothing was tried.
    return { ok: false, error: new ApiError(400, 'bad_rim'), patch: used, reached: false }
  }
  const e = d.estimate
  if (d.status !== 'ok' || !e || d.diameter_provisional || !isPositive(e.abw_g) || !isPositive(e.shrimp_per_kg) || !Number.isInteger(e.n) || e.n <= 0) {
    const code = (d.status === 'error' && d.error_code) || 'no_result'
    return { ok: false, error: new ApiError(502, 'measure_failed', code), patch: { ...used, status: 'error', errorCode: code, flags: own }, reached: true }
  }
  const [lo, hi] = Array.isArray(e.range_g) ? e.range_g : [null, null]
  const shrimpXy = validShrimpXy(d.shrimp)
  const serviceFlags = (Array.isArray(d.flags) ? d.flags : []).filter((f) => typeof f === 'string' && !isOwnFlag(f))
  return {
    ok: true,
    patch: {
      ...used,
      status: 'ok',
      netId: net.id,
      refCm: net.cm,
      n: e.n,
      abw: e.abw_g,
      abwLo: isPositive(lo) && lo <= e.abw_g ? lo : null,
      abwHi: isPositive(hi) && hi >= e.abw_g ? hi : null,
      perKg: e.shrimp_per_kg,
      cv: typeof e.cv_pct === 'number' && Number.isFinite(e.cv_pct) && e.cv_pct >= 0 ? e.cv_pct / 100 : null,
      flags: [...own, ...(again ? [REMEASURE_FLAG] : []), ...serviceFlags],
      rim: validRing(d.tray?.ellipse) ?? asked,
      rimRadiusPx: isPositive(d.rim_radius_px) ? d.rim_radius_px : null,
      canvasPx: validCanvasPx(d.tray?.canvas_px),
      shrimpXy,
      // Each dot's length, only when there are dots to pair it with.
      lenPx: shrimpXy ? shrimpLenPx(d.shrimp, d.rim_radius_px, d.tray?.diameter_cm ?? net.cm) : null,
      pxLengths: Array.isArray(d.px_lengths) ? d.px_lengths : null,
      // A re-measure keeps the time of the first.
      measuredAt: row.measuredAt ?? new Date().toISOString(),
      retakeReason: null,
      errorCode: null,
    },
  }
}

interface Measured {
  row: ScanRow
  creditsLeft: number
}

async function creditsLeft(repos: Repos, farm: FarmRow): Promise<number> {
  const limit = scanDailyLimit()
  return (await repos.quota.left(farm.id, limit)) ?? limit
}

/** The photo's bytes and format, for the service. */
async function photoOf(repos: Repos, row: ScanRow): Promise<{ bytes: Buffer; type: SizingImageType }> {
  const photo = row.imageFileId ? await repos.photos.read(row.imageFileId) : null
  const info = photo ? imageInfo(photo.bytes) : null
  if (!photo || !info) throw new ApiError(404, 'photo_missing')
  return { bytes: photo.bytes, type: info.type }
}

/** The farm's unsaved scan that this person may measure: their own photo, or anyone's for an owner or manager. */
async function measurable(repos: Repos, farm: FarmRow, me: MemberRow, id: string): Promise<ScanRow> {
  const row = await repos.scans.byId(id)
  if (!row || row.farmId !== farm.id) throw new ApiError(404, 'not_found')
  if (!mayMeasure(me, row)) throw new ApiError(403, 'not_allowed')
  if (row.sampleDate) throw new ApiError(409, 'already_saved')
  return row
}

/** The first measure of the photo: charged first, refunded on anything but a result. */
async function billed(repos: Repos, sizing: SizingClient, row: ScanRow, net: NetRow, asked: SizingRing): Promise<Measured> {
  const photo = await photoOf(repos, row)
  const left = await repos.quota.consume(row.id, scanDailyLimit())
  if (left === null || left < 0) throw new ApiError(402, 'no_credits')
  let kept = false
  try {
    await repos.scans.update(row.id, { status: 'measuring' })
    const out = outcomeOf(await sizing.measure(photo.bytes, photo.type, { diameterCm: net.cm, rimEllipse: asked, runId: row.id }), row, net, asked, false)
    if (!out.ok) {
      await repos.scans.update(row.id, { status: 'queued', ...out.patch })
      throw out.error
    }
    await repos.scans.update(row.id, out.patch)
    kept = true
    return { row: { ...row, ...out.patch }, creditsLeft: left }
  } finally {
    if (!kept) {
      await repos.quota.refund(row.id).catch((err: unknown) => logger.warn('[liff] could not refund a measure', { error: err instanceof Error ? err.message : String(err) }))
    }
  }
}

/** A measured photo again, free: the paid result stands unless a new one comes back. */
async function again(repos: Repos, sizing: SizingClient, farm: FarmRow, row: ScanRow, net: NetRow, asked: SizingRing): Promise<Measured> {
  if (remeasuresOf(row.flags) >= REMEASURES_MAX) throw new ApiError(409, 'remeasure_limit')
  const photo = await photoOf(repos, row)
  const out = outcomeOf(await sizing.measure(photo.bytes, photo.type, { diameterCm: net.cm, rimEllipse: asked, runId: row.id }), row, net, asked, true)
  if (!out.ok) {
    // Only what the attempt cost, and the attempt itself once it reached the service.
    const cost: ScanPatch = { sam3Calls: out.patch.sam3Calls, sam3HttpAttempts: out.patch.sam3HttpAttempts }
    if (out.reached) await repos.scans.update(row.id, { ...cost, flags: [...row.flags, REMEASURE_FLAG] })
    else if (cost.sam3Calls !== undefined) await repos.scans.update(row.id, cost)
    throw out.error
  }
  await repos.scans.update(row.id, out.patch)
  return { row: { ...row, ...out.patch }, creditsLeft: await creditsLeft(repos, farm) }
}

export function measureRouter(getRepos: GetRepos, sizing: SizingClient): Router {
  const r = Router()

  r.post(
    '/scans/:id/measure',
    handle(getRepos, async ({ req, repos, ctx }): Promise<MeasureResponse> => {
      const { farm, me } = requireFarm(ctx)
      const rim = parseRim(req.body)
      const askedNet = (req.body as { netId?: unknown }).netId
      // One measure of a photo at a time: a double tap waits, then is a re-measure.
      return oneAtATime(`measure:${req.params.id}`, async () => {
        const row = await measurable(repos, farm, me, req.params.id!)
        const size = photoSizeOf(row.flags)
        if (!size) throw new ApiError(404, 'photo_missing')
        const ellipse = pointsToEllipse(rim, size.width, size.height)
        if (!ellipse) throw new ApiError(400, 'bad_rim')
        const [nets, ponds] = await Promise.all([repos.nets.ofFarm(farm.id), repos.ponds.ofFarm(farm.id)])
        const pond = ponds.find((p) => p.id === row.pondId)
        const net = nets.find((n) => n.id === askedNet) ?? (pond ? pondNet(nets, pond) : null)
        if (!net) throw new ApiError(409, 'no_net')
        const asked = ellipseToRing(ellipse)
        const done = row.status === 'ok' ? await again(repos, sizing, farm, row, net, asked) : await billed(repos, sizing, row, net, asked)
        return { scan: await scanView(repos, farm.id, done.row, me), creditsLeft: done.creditsLeft }
      })
    }),
  )

  r.post(
    '/scans/:id/net',
    handle(getRepos, async ({ req, repos, ctx }): Promise<MeasureResponse> => {
      const { farm, me } = requireFarm(ctx)
      // A worker has no ยอ step: the ยอ is the owner's to choose.
      if (me.role === 'worker') throw new ApiError(403, 'not_allowed')
      const netId = (req.body as { netId?: unknown } | undefined)?.netId
      if (typeof netId !== 'string' || !netId) throw new ApiError(400, 'bad_request')
      return oneAtATime(`measure:${req.params.id}`, async () => {
        const row = await measurable(repos, farm, me, req.params.id!)
        if (row.status !== 'ok' || !row.rim || row.rim.length !== 5) throw new ApiError(409, 'not_measured')
        const net = (await repos.nets.ofFarm(farm.id)).find((n) => n.id === netId)
        if (!net) throw new ApiError(404, 'not_found')
        // The same photo and rim on the other ยอ; the pond keeps that ยอ from now on.
        const done = net.id === row.netId ? { row, creditsLeft: await creditsLeft(repos, farm) } : await again(repos, sizing, farm, row, net, row.rim as SizingRing)
        await repos.ponds.setNet(row.pondId, net.id)
        return { scan: await scanView(repos, farm.id, done.row, me), creditsLeft: done.creditsLeft }
      })
    }),
  )

  return r
}
