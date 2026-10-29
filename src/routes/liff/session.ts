/**
 * GET /session, POST /start (O2 to O6) and PATCH /farm (the target size).
 *
 * A new person makes an OA farm by naming it and its ponds. Taking a farm over
 * from น้องน้ำ (`useFarmId`) is refused by the guard while this OA reads the
 * prod database (src/data/context.ts), so `Session.candidate` is always null.
 */

import { Router } from 'express'
import type { Session } from '../../contract/types.js'
import { TH } from '../../copy/th.js'
import { ApiError, requireFarm, resolveContext, type Ctx } from '../../data/context.js'
import type { Repos } from '../../data/types.js'
import { bangkokDay, scanDailyLimit, TARGET_CHOICES, zoneOf } from '../../domain/farm.js'
import { effective } from '../../domain/permissions.js'
import { envName } from '../liff-me.js'
import { handle, type GetRepos } from './handle.js'

const NAME_MAX = 80
const PONDS_MAX = 300
const CODE_MAX = 20

export async function sessionFor(repos: Repos, ctx: Ctx, lineName: string | undefined): Promise<Session> {
  if (ctx.blocked) throw new ApiError(403, 'use_nong_nam')
  const base = { today: bangkokDay(), candidate: null, env: envName() }
  if (!ctx.farm || !ctx.me) {
    return { ...base, user: { name: lineName ?? '' }, farm: null, role: null, permissions: effective('worker'), pondIds: [], creditsLeft: 0 }
  }
  const { farm, me } = ctx
  const limit = scanDailyLimit()
  const [ponds, members, targetPerKg, left] = await Promise.all([
    repos.ponds.ofFarm(farm.id),
    repos.members.ofFarm(farm.id),
    repos.farms.target(farm.id),
    repos.quota.left(farm.id, limit),
  ])
  const owner = members.find((m) => m.role === 'owner' && m.lineUserId === farm.createdBy) ?? members.find((m) => m.role === 'owner')
  const pondIds = new Set(ponds.map((p) => p.id))
  return {
    ...base,
    user: { name: me.name || lineName || (me.role === 'owner' ? TH.ownerFallback : '') },
    farm: {
      id: farm.id,
      name: farm.name,
      pondCount: ponds.length,
      zoneCount: new Set(ponds.map((p) => zoneOf(p.code))).size,
      memberCount: members.length,
      ownerName: owner?.name || TH.ownerFallback,
      targetPerKg,
    },
    role: me.role,
    permissions: effective(me.role),
    pondIds: me.role === 'owner' ? ponds.map((p) => p.id) : me.pondIds.filter((id) => pondIds.has(id)),
    creditsLeft: left ?? limit,
  }
}

const bad = () => new ApiError(400, 'bad_request')

/** The farm name and pond codes, trimmed and checked; `useFarmId` is the guard's. */
export function parseStart(body: unknown): { name: string; ponds: string[] } {
  if (body && typeof body === 'object' && 'useFarmId' in body) throw new ApiError(403, 'use_nong_nam')
  const b = (body ?? {}) as { name?: unknown; ponds?: unknown }
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name || name.length > NAME_MAX) throw bad()
  if (!Array.isArray(b.ponds) || b.ponds.length < 1 || b.ponds.length > PONDS_MAX) throw bad()
  const ponds: string[] = []
  const seen = new Set<string>()
  for (const p of b.ponds as unknown[]) {
    if (typeof p !== 'string') throw bad()
    const code = p.trim()
    const key = code.toUpperCase()
    if (!code || code.length > CODE_MAX || seen.has(key)) throw bad()
    seen.add(key)
    ponds.push(code)
  }
  return { name, ponds }
}

/**
 * One start at a time per person, so a double tap makes one farm: the second
 * waits for the first, then finds the farm and makes nothing. One process
 * only (Railway runs one instance).
 */
const starting = new Map<string, Promise<unknown>>()

async function oneAtATime<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const before = starting.get(key) ?? Promise.resolve()
  const run = before.catch(() => undefined).then(fn)
  starting.set(key, run)
  try {
    return await run
  } finally {
    if (starting.get(key) === run) starting.delete(key)
  }
}

export function sessionRouter(getRepos: GetRepos): Router {
  const r = Router()

  r.get('/session', handle(getRepos, ({ req, repos, ctx }) => sessionFor(repos, ctx, req.lineDisplayName)))

  r.post(
    '/start',
    handle(getRepos, async ({ req, repos, ctx }) => {
      if (ctx.blocked) throw new ApiError(403, 'use_nong_nam')
      if (ctx.farm) return sessionFor(repos, ctx, req.lineDisplayName)
      const body = parseStart(req.body)
      const lineUserId = req.lineUserId!
      const done = await oneAtATime(lineUserId, async () => {
        // Read again inside the lock: a start that finished meanwhile made the farm.
        const now = await resolveContext(repos, lineUserId)
        if (!now.farm && !now.blocked) {
          await repos.farms.createOaFarm({ ownerId: lineUserId, ownerName: req.lineDisplayName ?? null, name: body.name, pondCodes: body.ponds })
          return resolveContext(repos, lineUserId)
        }
        return now
      })
      return sessionFor(repos, done, req.lineDisplayName)
    }),
  )

  r.patch(
    '/farm',
    handle(getRepos, async ({ req, repos, ctx }) => {
      const { farm, me } = requireFarm(ctx)
      if (me.role !== 'owner') throw new ApiError(403, 'not_allowed')
      const n = (req.body as { targetPerKg?: unknown } | undefined)?.targetPerKg
      if (typeof n !== 'number' || !TARGET_CHOICES.includes(n)) throw bad()
      await repos.farms.setTarget(farm.id, n)
      return sessionFor(repos, ctx, req.lineDisplayName)
    }),
  )

  return r
}
