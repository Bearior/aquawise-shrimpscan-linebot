/**
 * A scan's photo, its view and its save: POST /scans?pondId= (the photo as
 * the raw body, JPEG, PNG or WebP, at most 12 MB), GET /scans/:id and
 * POST /scans/:id/save. Measuring is measure.ts.
 *
 * Upload order: the photo is checked first (format and size from its bytes,
 * never the Content-Type alone), then the pond and the person. Then the scan
 * row (`status 'queued'`, the photo's sha256), the object in the private
 * bucket, its record_image_files row and the link. Anything that fails there
 * undoes what was written, so the same photo can be sent again. Last, น้ำ's
 * rim guess (POST /v1/rim, free); a miss, or no service, is the LIFF's
 * centred guess.
 *
 * prod keeps no photo size, so it rides in flags as `size:<W>x<H>`, beside
 * the plan's `remeasure`, `note:` and `fixed:` entries. The guess is the
 * scan's rim_ellipse until the scan is measured.
 *
 * Save puts the measured scan in the pond for today (`sample_date`, one per
 * pond per day) and writes น้องน้ำ's growth row for that pond-day through
 * its own guarded RPC. A worker's note chips ride in flags as `note:<text>`.
 */

import { createHash } from 'node:crypto'
import express, { Router, type NextFunction, type Request, type Response } from 'express'
import type { SaveResponse, Scan, ScanCreateResponse, ScanResult } from '../../contract/types.js'
import { ApiError, requireFarm } from '../../data/context.js'
import type { FarmRow, MemberRow, PondRow, Repos, ScanRow } from '../../data/types.js'
import { bangkokDay, daysBetween } from '../../domain/farm.js'
import { personName } from '../../domain/names.js'
import { netView, pondNet } from '../../domain/nets.js'
import { effective } from '../../domain/permissions.js'
import { CENTRED_RING, ringToPoints } from '../../domain/rim-geometry.js'
import { foundOf, mayMeasure, photoSizeOf, scanFor, toScanResult } from '../../domain/scan-view.js'
import { imageInfo, type ImageInfo } from '../../lib/image-size.js'
import { logger } from '../../lib/logger.js'
import type { SizingClient } from '../../lib/sizing.js'
import { bodyErrors } from './errors.js'
import { handle, type GetRepos } from './handle.js'
import { oneAtATime } from './lock.js'
import { farmView, pondOf, tileFor } from './ponds.js'

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const EXTENSION: Record<ImageInfo['type'], string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const NOTES_MAX = 10
const NOTE_CHARS_MAX = 80
/** growth_samples has no age bound; sizing_measurements' 0..400 is kept here too. */
const AGE_DAYS_MAX = 400

export function scanStatus(row: ScanRow): Scan['status'] {
  if (row.sampleDate) return 'saved'
  return row.status === 'ok' ? 'measured' : 'waiting'
}

const isMeasured = (row: ScanRow) => row.status === 'ok' && row.abw !== null && row.perKg !== null && row.refCm !== null

/** The pond's saved scan before this one (`saved` newest first). */
function previousOf(saved: ScanRow[], row: ScanRow): ScanResult['previous'] {
  const before = row.sampleDate ?? bangkokDay()
  const p = saved.find((s) => s.id !== row.id && s.sampleDate !== null && s.sampleDate < before && s.abw !== null)
  return p ? { abw: p.abw!, date: p.sampleDate! } : null
}

/** The scan as `me` reads it: the result once measured (a worker gets only the dots). */
export async function scanView(repos: Repos, farmId: string, row: ScanRow, me: MemberRow): Promise<Scan> {
  const measured = isMeasured(row)
  const [ponds, nets, members, urls, saved] = await Promise.all([
    repos.ponds.ofFarm(farmId),
    repos.nets.ofFarm(farmId),
    repos.members.ofFarm(farmId),
    row.imageFileId ? repos.photos.urls([row.imageFileId]) : Promise.resolve({} as Record<string, string>),
    measured ? repos.scans.savedOfPond(row.pondId) : Promise.resolve([] as ScanRow[]),
  ])
  const pond = ponds.find((p) => p.id === row.pondId)
  const size = photoSizeOf(row.flags)
  const net = pond ? pondNet(nets, pond) : null
  const W = size?.width ?? 0
  const H = size?.height ?? 0
  const sized = measured && size !== null
  return scanFor(me, {
    id: row.id,
    pondId: row.pondId,
    pondCode: pond?.code ?? '',
    photoUrl: (row.imageFileId && urls[row.imageFileId]) || '',
    width: size?.width ?? 0,
    height: size?.height ?? 0,
    rimGuess: row.rim && size ? ringToPoints(row.rim, size.width, size.height) : [...CENTRED_RING],
    net: net ? netView(net, nets, ponds, members) : null,
    photoBy: personName(members, row.lineUserId),
    photoAt: row.createdAt,
    status: scanStatus(row),
    result: sized ? toScanResult(row, { id: row.netId ?? '', cm: row.refCm! }, W, H, previousOf(saved, row)) : null,
    found: sized ? (foundOf(row, W, H) ?? []) : null,
    measuredBy: measured ? personName(members, row.lineUserId) : null,
    canFix: measured && me.role !== 'worker' && (row.lineUserId === me.lineUserId || effective(me.role).editOthers),
  })
}

/** The body's note chips, trimmed; empty ones dropped. */
function parseNotes(body: unknown): string[] {
  const notes = (body as { notes?: unknown } | undefined)?.notes
  if (notes === undefined) return []
  if (!Array.isArray(notes) || notes.length > NOTES_MAX) throw new ApiError(400, 'bad_request')
  return notes
    .map((n: unknown) => {
      if (typeof n !== 'string' || n.trim().length > NOTE_CHARS_MAX) throw new ApiError(400, 'bad_request')
      return n.trim()
    })
    .filter(Boolean)
}

/**
 * น้องน้ำ's growth row for the pond-day, through the RPC its own scan writes
 * with. The OA reads its own scans, so a miss is logged, never the save's
 * failure.
 */
async function mirrorGrowth(repos: Repos, farm: FarmRow, row: ScanRow, day: string): Promise<void> {
  try {
    const cycle = await repos.cycles.openOf(row.pondId)
    const age = cycle?.stockedOn ? daysBetween(cycle.stockedOn, day) : null
    const outcome = await repos.growth.writePhotoDay({
      farmKey: farm.createdBy,
      pondId: row.pondId,
      day,
      cycleId: cycle?.id ?? null,
      ageDays: age !== null && age >= 0 && age <= AGE_DAYS_MAX ? age : null,
      abw: row.abw!,
      lo: row.abwLo,
      hi: row.abwHi,
      n: row.n!,
      perKg: row.perKg!,
    })
    if (outcome !== 'written') logger.info('[liff] the pond-day kept its other growth row', { outcome })
  } catch (err) {
    logger.warn('[liff] could not write the pond-day growth row', { error: err instanceof Error ? err.message : String(err) })
  }
}

/** The save's answer: how far the person is today, and (not for a worker) when the pond reaches size. */
async function saveAnswer(repos: Repos, farm: FarmRow, me: MemberRow, pondId: string, today: string): Promise<SaveResponse> {
  const view = await farmView(repos, farm, me)
  const pond = view.ponds.find((p) => p.id === pondId)
  const live = new Set(view.ponds.map((p) => p.id))
  const mine = me.role === 'owner' ? [...live] : me.pondIds.filter((id) => live.has(id))
  const done = new Set((await repos.scans.savedOfFarm(farm.id, today)).filter((s) => s.sampleDate === today).map((s) => s.pondId))
  const scans = pond && me.role !== 'worker' ? (await repos.scans.savedOfPond(pond.id)).filter((s) => s.abw !== null && s.perKg !== null) : []
  return {
    pondId,
    pondCode: pond?.code ?? '',
    doneToday: mine.filter((id) => done.has(id)).length,
    mineTotal: mine.length,
    reachOn: pond && me.role !== 'worker' ? tileFor(view, pond, scans).reachOn : null,
  }
}

/** 415 before the body is read: only a photo type gets that far. */
function photoOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.is(PHOTO_TYPES)) return next()
  res.status(415).json({ error: 'unsupported_type' })
}

/** Best effort, each step on its own: what an unfinished upload wrote. */
async function undo(repos: Repos, scanId: string, path: string | null, fileId: string | null): Promise<void> {
  const steps: [string, () => Promise<void>][] = [
    ['scan', () => repos.scans.remove(scanId)],
    ['file', () => (fileId ? repos.photos.removeFile(fileId) : Promise.resolve())],
    ['object', () => (path ? repos.photos.removeObject(path) : Promise.resolve())],
  ]
  for (const [what, step] of steps) {
    await step().catch((err: unknown) => logger.warn('[liff] could not undo an unfinished upload', { what, error: err instanceof Error ? err.message : String(err) }))
  }
}

async function store(repos: Repos, sizing: SizingClient, farm: FarmRow, me: MemberRow, pond: PondRow, bytes: Buffer, info: ImageInfo, sha256: string): Promise<ScanRow> {
  const made = await repos.scans.create({
    farmId: farm.id,
    pondId: pond.id,
    lineUserId: me.lineUserId,
    sha256,
    flags: [`size:${info.width}x${info.height}`],
  })
  if (made === 'duplicate') {
    // The same bytes again: a retry of this upload is this scan; anything else is a photo used twice.
    const prior = await repos.scans.bySha(farm.id, sha256)
    if (prior && prior.pondId === pond.id && prior.lineUserId === me.lineUserId && prior.status === 'queued' && !prior.sampleDate && prior.imageFileId) {
      return prior
    }
    throw new ApiError(409, 'same_photo')
  }

  const path = `shrimp-scan/${farm.id}/${made.id}.${EXTENSION[info.type]}`
  let stored = false
  let fileId: string | null = null
  try {
    await repos.photos.put(path, bytes, info.type)
    stored = true
    fileId = await repos.photos.addFile({ farmId: farm.id, lineUserId: me.lineUserId, ref: path, mime: info.type, bytes: bytes.length, pondId: pond.id })
    await repos.scans.linkImage(made.id, fileId)
  } catch (err) {
    await undo(repos, made.id, stored ? path : null, fileId)
    throw err
  }

  let rim: number[] | null = null
  const found = await sizing.detectRim(bytes, info.type)
  if (found.ok && found.data.found && found.data.ring) {
    try {
      await repos.scans.setRim(made.id, found.data.ring)
      rim = found.data.ring
    } catch (err) {
      // The photo is in; only the guess is lost, and the centred one stands in.
      logger.warn('[liff] could not keep the rim guess', { error: err instanceof Error ? err.message : String(err) })
    }
  }
  return { ...made, imageFileId: fileId, rim }
}

export function scansRouter(getRepos: GetRepos, sizing: SizingClient): Router {
  const r = Router()

  r.post(
    '/scans',
    photoOnly,
    express.raw({ type: PHOTO_TYPES, limit: MAX_PHOTO_BYTES }),
    bodyErrors,
    handle(getRepos, async ({ req, repos, ctx }): Promise<ScanCreateResponse> => {
      const { farm, me } = requireFarm(ctx)
      const bytes: unknown = req.body
      const info = Buffer.isBuffer(bytes) ? imageInfo(bytes) : null
      if (!info) throw new ApiError(415, 'unsupported_type')
      const pond = pondOf(await repos.ponds.ofFarm(farm.id), typeof req.query.pondId === 'string' ? req.query.pondId : '')
      // A worker scans the ponds they look after; the owner gives them the pond first.
      if (me.role === 'worker' && !me.pondIds.includes(pond.id)) throw new ApiError(403, 'not_allowed')
      const photo = bytes as Buffer
      const sha256 = createHash('sha256').update(photo).digest('hex')
      // One photo at a time: a double tap waits, then is the same scan.
      const row = await oneAtATime(`upload:${farm.id}:${sha256}`, () => store(repos, sizing, farm, me, pond, photo, info, sha256))
      return { scan: await scanView(repos, farm.id, row, me) }
    }),
  )

  r.get(
    '/scans/:id',
    handle(getRepos, async ({ req, repos, ctx }): Promise<Scan> => {
      const { farm, me } = requireFarm(ctx)
      const row = await repos.scans.byId(req.params.id!)
      if (!row || row.farmId !== farm.id) throw new ApiError(404, 'not_found')
      return scanView(repos, farm.id, row, me)
    }),
  )

  r.post(
    '/scans/:id/save',
    handle(getRepos, async ({ req, repos, ctx }): Promise<SaveResponse> => {
      const { farm, me } = requireFarm(ctx)
      const notes = parseNotes(req.body)
      const found = await repos.scans.byId(req.params.id!)
      if (!found || found.farmId !== farm.id) throw new ApiError(404, 'not_found')
      // One save into a pond at a time: two people saving it at once leave one scan in it.
      return oneAtATime(`save:${found.pondId}`, async () => {
        const row = await repos.scans.byId(found.id)
        if (!row) throw new ApiError(404, 'not_found')
        if (!mayMeasure(me, row)) throw new ApiError(403, 'not_allowed')
        if (!isMeasured(row) || !row.n) throw new ApiError(409, 'not_measured')
        const today = bangkokDay()
        if (row.sampleDate && row.sampleDate !== today) throw new ApiError(409, 'already_saved')
        await repos.scans.unsaveDay(row.pondId, today, row.id)
        await repos.scans.update(row.id, { sampleDate: today, sampleDateSource: 'farmer', flags: [...row.flags, ...notes.map((n) => `note:${n}`)] })
        await mirrorGrowth(repos, farm, row, today)
        return saveAnswer(repos, farm, me, row.pondId, today)
      })
    }),
  )

  return r
}
