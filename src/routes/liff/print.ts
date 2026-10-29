/**
 * The A4 sheets (O32 to O34): GET /print/farm and GET /print/pond/:id, for a
 * person with printSheet. The LIFF prints them itself. POST /print/send
 * (pictures of the sheet into the chat) is not built: it needs a renderer on
 * the server, so it stays 501 not_built_yet.
 */

import { Router } from 'express'
import type { FarmSheet, PondSheet } from '../../contract/types.js'
import { ApiError, requireFarm } from '../../data/context.js'
import { photoSizeOf, toScanResult } from '../../domain/scan-view.js'
import { handle, type GetRepos } from './handle.js'
import { need, overviewOf } from './overview.js'
import { farmTiles, farmView, growthOf, pondOf, savedScans, summaries, tileFor } from './ponds.js'

const WATCH_ORDER: Record<string, number> = { urgent: 0, missing: 1, watch: 2 }

export function printRouter(getRepos: GetRepos): Router {
  const r = Router()

  r.get(
    '/print/farm',
    handle(getRepos, async ({ repos, ctx }): Promise<FarmSheet> => {
      const { farm, me } = requireFarm(ctx)
      need(me, 'printSheet')
      const view = await farmView(repos, farm, me)
      const [tiles, settings] = await Promise.all([farmTiles(repos, view), repos.settings.read(farm.id)])
      const o = overviewOf(view, tiles, settings.acks)
      const caretakerOf = (id: string) => tiles.find((t) => t.id === id)?.caretaker ?? null
      return {
        farmName: farm.name,
        date: view.today,
        printedAt: new Date().toISOString(),
        targetPerKg: view.targetPerKg,
        photosToday: { sent: o.photosToday.sent, total: o.photosToday.total },
        tiles: o.tiles,
        queue: [...o.soon.rows.map((x) => ({ ...x, soon: true })), ...o.later.rows.map((x) => ({ ...x, soon: false }))].map((x) => ({
          ...x,
          caretaker: caretakerOf(x.pondId),
        })),
        watch: tiles
          .filter((t) => t.status === 'urgent' || t.status === 'missing' || t.status === 'watch')
          .sort((a, b) => WATCH_ORDER[a.status]! - WATCH_ORDER[b.status]! || a.code.localeCompare(b.code))
          .map((t) => ({ pondCode: t.code, kind: t.status as 'urgent' | 'missing' | 'watch', caretaker: t.caretaker, issue: t.issue ?? '', perKg: t.perKg })),
        zones: [...new Set(tiles.map((t) => t.zone))].map((zone) => ({
          zone,
          caretaker: tiles.find((t) => t.zone === zone)?.caretaker ?? null,
          ponds: tiles.filter((t) => t.zone === zone),
        })),
      }
    }),
  )

  r.get(
    '/print/pond/:id',
    handle(getRepos, async ({ req, repos, ctx }): Promise<PondSheet> => {
      const { farm, me } = requireFarm(ctx)
      need(me, 'printSheet')
      const view = await farmView(repos, farm, me)
      const pond = pondOf(view.ponds, req.params.id!)
      const scans = await savedScans(repos, pond.id)
      const last = scans[0]
      const size = last ? photoSizeOf(last.flags) : null
      // The sheet is the latest result on its photo: none without a measured, sized scan.
      if (!last || !size || last.refCm === null) throw new ApiError(404, 'not_found')
      const before = scans[1]
      const [scan] = await summaries(repos, view, scans.slice(0, 2))
      return {
        farmName: farm.name,
        pond: tileFor(view, pond, scans),
        scan: scan!,
        result: toScanResult(last, { id: last.netId ?? '', cm: last.refCm }, size.width, size.height, before ? { abw: before.abw!, date: before.sampleDate! } : null),
        photoWidth: size.width,
        photoHeight: size.height,
        growth: growthOf(scans, view.cycles.get(pond.id)?.stockedOn ?? null),
        targetPerKg: view.targetPerKg,
      }
    }),
  )

  return r
}
