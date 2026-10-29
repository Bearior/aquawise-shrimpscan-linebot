/**
 * The farm's ยอ: GET /nets, POST /nets, PATCH /nets/:id. Round only for now
 * (Bear): a square ยอ answers 422 net_shape_unsupported and the LIFF hides
 * the สี่เหลี่ยม card (SQUARE_NET_ENABLED).
 *
 * The farm ยอ is the oldest live one. There is one live ยอ per size, so
 * adding a size the farm has is that same ยอ (a double tap adds one). A size
 * is history once a photo was measured with it (line-bot's rule, and the
 * trigger farm_nets_diameter_locked): correcting a used ยอ archives it and
 * adds the corrected one in its place, with its ponds, its age and who added
 * it, so a corrected farm ยอ stays the farm ยอ.
 */

import { Router, type Request } from 'express'
import { NET_CM_MAX, NET_CM_MIN, type Net, type NetsResponse } from '../../contract/types.js'
import { ApiError, requireFarm } from '../../data/context.js'
import type { FarmRow, MemberRow, NetRow, Repos } from '../../data/types.js'
import { netView, pondNet } from '../../domain/nets.js'
import { handle, type GetRepos } from './handle.js'
import { noWorker, pondOf } from './ponds.js'

/** The ยอ a pond measures with: its own while it is live, else the farm ยอ; null when the farm has none. */
export async function netOf(repos: Repos, farmId: string, pondId: string): Promise<NetRow | null> {
  const [nets, ponds] = await Promise.all([repos.nets.ofFarm(farmId), repos.ponds.ofFarm(farmId)])
  const pond = ponds.find((p) => p.id === pondId)
  return pond ? pondNet(nets, pond) : null
}

function bodyOf(req: Request): Record<string, unknown> {
  const b: unknown = req.body
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {}
}

function checkShape(raw: unknown, required: boolean): void {
  if (raw === 'round' || (raw === undefined && !required)) return
  if (raw === 'square') throw new ApiError(422, 'net_shape_unsupported')
  throw new ApiError(400, 'bad_request')
}

/** Whole cm, NET_CM_MIN to NET_CM_MAX (the farm_nets check is 30 to 200). */
function parseCm(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < NET_CM_MIN || raw > NET_CM_MAX) {
    throw new ApiError(422, 'net_out_of_range')
  }
  return raw
}

async function viewOf(repos: Repos, farmId: string, netId: string): Promise<Net> {
  const [nets, ponds, members] = await Promise.all([repos.nets.ofFarm(farmId), repos.ponds.ofFarm(farmId), repos.members.ofFarm(farmId)])
  const net = nets.find((n) => n.id === netId)
  if (!net) throw new ApiError(404, 'not_found')
  return netView(net, nets, ponds, members)
}

/** Writes the new size; returns the id of the ยอ that now has it. */
async function correct(repos: Repos, farm: FarmRow, me: MemberRow, net: NetRow, cm: number): Promise<string> {
  const done = await repos.nets.setCm(farm.id, net.id, cm)
  if (done === 'ok') return net.id
  if (done === 'not_found') throw new ApiError(404, 'not_found')
  if (done === 'name_taken') throw new ApiError(409, 'net_exists')
  const made = await repos.nets.create({
    farmId: farm.id,
    farmKey: farm.createdBy,
    cm,
    createdBy: net.createdBy ?? me.lineUserId,
    createdAt: net.createdAt,
  })
  if (made === 'name_taken') throw new ApiError(409, 'net_exists')
  await repos.ponds.moveNet(farm.id, net.id, made.id)
  await repos.nets.archive(farm.id, net.id)
  return made.id
}

export function netsRouter(getRepos: GetRepos): Router {
  const r = Router()

  // A worker reads the list too: the scan shows the pond's ยอ as a chip.
  r.get(
    '/nets',
    handle(getRepos, async ({ repos, ctx }): Promise<NetsResponse> => {
      const { farm } = requireFarm(ctx)
      const [nets, ponds, members] = await Promise.all([repos.nets.ofFarm(farm.id), repos.ponds.ofFarm(farm.id), repos.members.ofFarm(farm.id)])
      return { nets: nets.map((n) => netView(n, nets, ponds, members)) }
    }),
  )

  // `farmDefault` is not read: the first ยอ is the farm ยอ, and only the first.
  r.post(
    '/nets',
    handle(getRepos, async ({ req, repos, ctx }): Promise<Net> => {
      const { farm, me } = requireFarm(ctx)
      noWorker(me)
      const body = bodyOf(req)
      checkShape(body.shape, true)
      const cm = parseCm(body.cm)
      if (body.pondId != null && typeof body.pondId !== 'string') throw new ApiError(400, 'bad_request')
      const pond = typeof body.pondId === 'string' ? pondOf(await repos.ponds.ofFarm(farm.id), body.pondId) : null
      const made = await repos.nets.create({ farmId: farm.id, farmKey: farm.createdBy, cm, createdBy: me.lineUserId })
      const net = made !== 'name_taken' ? made : (await repos.nets.ofFarm(farm.id)).find((n) => n.cm === cm)
      if (!net) throw new ApiError(409, 'net_exists')
      if (pond) await repos.ponds.setNet(pond.id, net.id)
      return viewOf(repos, farm.id, net.id)
    }),
  )

  r.patch(
    '/nets/:id',
    handle(getRepos, async ({ req, repos, ctx }): Promise<Net> => {
      const { farm, me } = requireFarm(ctx)
      noWorker(me)
      const body = bodyOf(req)
      checkShape(body.shape, false)
      const cm = parseCm(body.cm)
      const net = (await repos.nets.ofFarm(farm.id)).find((n) => n.id === req.params.id)
      if (!net) throw new ApiError(404, 'not_found')
      const id = net.cm === cm ? net.id : await correct(repos, farm, me, net, cm)
      return viewOf(repos, farm.id, id)
    }),
  )

  return r
}
