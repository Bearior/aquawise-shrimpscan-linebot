/**
 * A scan's photo and its view: POST /scans?pondId= (the photo as the raw
 * body, JPEG, PNG or WebP, at most 12 MB) and GET /scans/:id.
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
 */

import { createHash } from 'node:crypto'
import express, { Router, type NextFunction, type Request, type Response } from 'express'
import type { Scan, ScanCreateResponse } from '../../contract/types.js'
import { ApiError, requireFarm } from '../../data/context.js'
import type { FarmRow, MemberRow, PondRow, Repos, ScanRow } from '../../data/types.js'
import { personName } from '../../domain/names.js'
import { netView, pondNet } from '../../domain/nets.js'
import { CENTRED_RING, ringToPoints } from '../../domain/rim-geometry.js'
import { imageInfo, type ImageInfo } from '../../lib/image-size.js'
import { logger } from '../../lib/logger.js'
import type { SizingClient } from '../../lib/sizing.js'
import { bodyErrors } from './errors.js'
import { handle, type GetRepos } from './handle.js'
import { oneAtATime } from './lock.js'
import { pondOf } from './ponds.js'

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const EXTENSION: Record<ImageInfo['type'], string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const SIZE_FLAG = /^size:(\d+)x(\d+)$/

/** The photo's px from its `size:<W>x<H>` flag. */
export function photoSizeOf(flags: string[]): { width: number; height: number } | null {
  for (const f of flags) {
    const m = SIZE_FLAG.exec(f)
    if (m) return { width: Number(m[1]), height: Number(m[2]) }
  }
  return null
}

export function scanStatus(row: ScanRow): Scan['status'] {
  if (row.sampleDate) return 'saved'
  return row.status === 'ok' ? 'measured' : 'waiting'
}

/** The scan as the LIFF reads it. Nothing measured yet: no result, no dots. */
export async function scanView(repos: Repos, farmId: string, row: ScanRow): Promise<Scan> {
  const [ponds, nets, members, urls] = await Promise.all([
    repos.ponds.ofFarm(farmId),
    repos.nets.ofFarm(farmId),
    repos.members.ofFarm(farmId),
    row.imageFileId ? repos.photos.urls([row.imageFileId]) : Promise.resolve({} as Record<string, string>),
  ])
  const pond = ponds.find((p) => p.id === row.pondId)
  const size = photoSizeOf(row.flags)
  const net = pond ? pondNet(nets, pond) : null
  return {
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
    result: null,
    found: null,
    measuredBy: null,
    canFix: false,
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
      return { scan: await scanView(repos, farm.id, row) }
    }),
  )

  r.get(
    '/scans/:id',
    handle(getRepos, async ({ req, repos, ctx }): Promise<Scan> => {
      const { farm } = requireFarm(ctx)
      const row = await repos.scans.byId(req.params.id!)
      if (!row || row.farmId !== farm.id) throw new ApiError(404, 'not_found')
      return scanView(repos, farm.id, row)
    }),
  )

  return r
}
