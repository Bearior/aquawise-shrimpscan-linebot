/**
 * แก้ไขโซนและบ่อ, the owner's only: PUT /zones/:zone names a zone, POST
 * /ponds adds ponds (a new zone is ponds with new leading letters), PATCH
 * /ponds/:id renames one.
 *
 * A zone is still the leading letters of its ponds' names (`zoneOf`). Its
 * name is only what people read, kept in the farm's settings row
 * (src/domain/settings.ts), so naming a zone never touches a pond, and a
 * pond's new name keeps its zone letters at its head: a rename never moves a
 * pond to another zone.
 */

import { Router } from 'express'
import type { PondRename, PondsAdd, ZoneNamePut } from '../../contract/types.js'
import { ApiError, requireFarm } from '../../data/context.js'
import type { MemberRow } from '../../data/types.js'
import { zoneOf } from '../../domain/farm.js'
import { ZONE_NAME_MAX, zoneNameOf } from '../../domain/settings.js'
import { handle, type GetRepos } from './handle.js'
import { oneAtATime } from './lock.js'
import { CODE_MAX, PONDS_MAX } from './session.js'

/** Ponds one request may add: a zone's worth. */
const ADD_MAX = 60

const bad = () => new ApiError(400, 'bad_request')

function ownerOnly(me: MemberRow): void {
  if (me.role !== 'owner') throw new ApiError(403, 'not_allowed')
}

function codeOf(raw: unknown): string {
  if (typeof raw !== 'string') throw bad()
  const code = raw.trim()
  if (!code || code.length > CODE_MAX) throw bad()
  return code
}

export function layoutRouter(getRepos: GetRepos): Router {
  const r = Router()

  r.put(
    '/zones/:zone',
    handle(getRepos, async ({ req, repos, ctx }) => {
      const { farm, me } = requireFarm(ctx)
      ownerOnly(me)
      const zone = req.params.zone!.toUpperCase()
      const raw = (req.body as Partial<ZoneNamePut> | undefined)?.name
      if (typeof raw !== 'string' || raw.trim().length > ZONE_NAME_MAX) throw bad()
      const name = zoneNameOf(raw)
      await oneAtATime(`settings:${farm.id}`, async () => {
        if (!(await repos.ponds.ofFarm(farm.id)).some((p) => zoneOf(p.code) === zone)) throw new ApiError(404, 'not_found')
        const settings = await repos.settings.read(farm.id)
        const { [zone]: _old, ...zones } = settings.zones
        await repos.settings.write(farm.id, { ...settings, zones: name ? { ...zones, [zone]: name } : zones })
      })
      return undefined
    }),
  )

  r.post(
    '/ponds',
    handle(getRepos, async ({ req, repos, ctx }) => {
      const { farm, me } = requireFarm(ctx)
      ownerOnly(me)
      const raw = (req.body as Partial<PondsAdd> | undefined)?.codes
      if (!Array.isArray(raw) || raw.length < 1 || raw.length > ADD_MAX) throw bad()
      const codes = raw.map(codeOf)
      if (new Set(codes.map((c) => c.toLowerCase())).size !== codes.length) throw bad()
      return oneAtATime(`layout:${farm.id}`, async () => {
        if ((await repos.ponds.ofFarm(farm.id)).length + codes.length > PONDS_MAX) throw new ApiError(409, 'too_many_ponds')
        const made = await repos.ponds.create({ farmId: farm.id, farmKey: farm.createdBy, codes })
        if (made === 'name_taken') throw new ApiError(409, 'name_taken')
        return { ponds: made.map((p) => ({ id: p.id, code: p.code })) }
      })
    }),
  )

  r.patch(
    '/ponds/:id',
    handle(getRepos, async ({ req, repos, ctx }) => {
      const { farm, me } = requireFarm(ctx)
      ownerOnly(me)
      const code = codeOf((req.body as Partial<PondRename> | undefined)?.code)
      await oneAtATime(`layout:${farm.id}`, async () => {
        const pond = (await repos.ponds.ofFarm(farm.id)).find((p) => p.id === req.params.id)
        if (!pond) throw new ApiError(404, 'not_found')
        if (zoneOf(code) !== zoneOf(pond.code)) throw bad()
        if (code === pond.code) return
        if ((await repos.ponds.rename(pond.id, code)) === 'name_taken') throw new ApiError(409, 'name_taken')
      })
      return undefined
    }),
  )

  return r
}
