/**
 * The owner's pond pages: GET /ponds (O7), GET /ponds/:id (O8),
 * GET /ponds/:id/scans (history), GET|PUT /ponds/:id/stocking and
 * PUT /ponds/:id/net. A worker sees no number: every one of these is 403
 * not_allowed for a worker.
 */

import { Router } from 'express'
import type { GrowthPoint, PondDetail, PondsResponse, PondTile, ScanSummary, Stocking, ZoneSummary } from '../../contract/types.js'
import { TH } from '../../copy/th.js'
import { ApiError, requireFarm } from '../../data/context.js'
import type { CycleRow, FarmRow, MemberRow, NetRow, PondRow, Repos, ScanRow } from '../../data/types.js'
import { addDays, bangkokDay, daysBetween, isDay } from '../../domain/farm.js'
import { effective } from '../../domain/permissions.js'
import { tileOf } from '../../domain/tiles.js'
import { userTag } from '../liff-me.js'
import { handle, type GetRepos } from './handle.js'

/** The pond list reads this many days of saved scans (growth uses the last 4). */
const LIST_DAYS = 60
const COUNT_MAX = 10_000_000

const round1 = (n: number) => Math.round(n * 10) / 10

export function noWorker(me: MemberRow): void {
  if (me.role === 'worker') throw new ApiError(403, 'not_allowed')
}

/** What every tile of the farm needs, read once. */
export interface FarmView {
  farm: FarmRow
  me: MemberRow
  ponds: PondRow[]
  members: MemberRow[]
  nets: NetRow[]
  cycles: Map<string, CycleRow>
  targetPerKg: number
  today: string
}

export async function farmView(repos: Repos, farm: FarmRow, me: MemberRow): Promise<FarmView> {
  const [ponds, members, nets, cycles, targetPerKg] = await Promise.all([
    repos.ponds.ofFarm(farm.id),
    repos.members.ofFarm(farm.id),
    repos.nets.ofFarm(farm.id),
    repos.cycles.openOfFarm(farm.id),
    repos.farms.target(farm.id),
  ])
  return { farm, me, ponds, members, nets, cycles: new Map(cycles.map((c) => [c.pondId, c])), targetPerKg, today: bangkokDay() }
}

/** The farm's pond with this id; a pond of another farm is not_found. */
export function pondOf(ponds: PondRow[], id: string): PondRow {
  const p = ponds.find((x) => x.id === id)
  if (!p) throw new ApiError(404, 'not_found')
  return p
}

/** The worker who looks after the pond, else a manager who does. */
function caretakerOf(members: MemberRow[], pondId: string): string | null {
  const w = members.find((m) => m.role === 'worker' && m.pondIds.includes(pondId))
  const m = members.find((x) => x.role === 'manager' && x.pondIds.includes(pondId))
  return (w ?? m)?.name || null
}

function nameOf(members: MemberRow[], lineUserId: string): string {
  return members.find((m) => m.lineUserId === lineUserId)?.name || TH.someone
}

/** Saved scans with a size, oldest first, from stocking on when it is known. */
function samplesOf(scans: ScanRow[], stockedOn: string | null | undefined): { date: string; abw: number }[] {
  return scans
    .filter((s) => s.sampleDate !== null && s.abw !== null && (!stockedOn || s.sampleDate >= stockedOn))
    .map((s) => ({ date: s.sampleDate!, abw: s.abw! }))
    .reverse()
}

/** `scans` are the pond's saved scans, newest first. */
export function tileFor(view: FarmView, pond: PondRow, scans: ScanRow[]): PondTile {
  const stockedOn = view.cycles.get(pond.id)?.stockedOn ?? null
  return tileOf({
    pond,
    samples: samplesOf(scans, stockedOn),
    cv: scans[0]?.cv ?? null,
    stockedOn,
    savedToday: scans.some((s) => s.sampleDate === view.today),
    caretaker: caretakerOf(view.members, pond.id),
    mine: view.me.role === 'owner' || view.me.pondIds.includes(pond.id),
    targetPerKg: view.targetPerKg,
    today: view.today,
    netId: pond.netId ?? view.nets[0]?.id ?? null,
  })
}

/** The last flag that starts with `prefix`, without it. */
function lastFlag(flags: string[], prefix: string): string | null {
  for (let i = flags.length - 1; i >= 0; i--) if (flags[i]!.startsWith(prefix)) return flags[i]!.slice(prefix.length)
  return null
}

function fixedOf(s: ScanRow, members: MemberRow[]): ScanSummary['fixed'] {
  const f = lastFlag(s.flags, 'fixed:')
  if (!f) return null
  const [tag, old] = f.split(':')
  const who = members.find((m) => userTag(m.lineUserId) === tag)
  const oldPerKg = Number(old)
  if (!Number.isFinite(oldPerKg)) return null
  return { by: who?.name || TH.someone, at: s.measuredAt ?? s.createdAt, oldPerKg }
}

/** A saved scan as the history shows it; `previous` is the pond's scan before it. */
function summaryOf(view: FarmView, s: ScanRow, previous: ScanRow | null, photoUrl: string): ScanSummary {
  const by = nameOf(view.members, s.lineUserId)
  const me = view.me
  return {
    scanId: s.id,
    date: s.sampleDate!,
    at: s.measuredAt ?? s.createdAt,
    abw: s.abw!,
    perKg: s.perKg!,
    cv: s.cv ?? 0,
    photoUrl,
    photoBy: by,
    measuredBy: by,
    fixed: fixedOf(s, view.members),
    lighter: Boolean(previous?.abw && s.abw! < previous.abw * 0.97),
    canFix: me.role !== 'worker' && (s.lineUserId === me.lineUserId || effective(me.role).editOthers),
  }
}

/** Saved scans that carry a size (a saved scan always should), newest first. */
async function savedScans(repos: Repos, pondId: string): Promise<ScanRow[]> {
  return (await repos.scans.savedOfPond(pondId)).filter((s) => s.abw !== null && s.perKg !== null)
}

async function summaries(repos: Repos, view: FarmView, scans: ScanRow[]): Promise<ScanSummary[]> {
  const urls = await repos.photos.urls(scans.flatMap((s) => (s.imageFileId ? [s.imageFileId] : [])))
  return scans.map((s, i) => summaryOf(view, s, scans[i + 1] ?? null, (s.imageFileId && urls[s.imageFileId]) || ''))
}

function stockingOf(c: CycleRow | null | undefined): Stocking {
  return { stockedOn: c?.stockedOn ?? null, count: c?.count ?? null, survival: c?.survival ?? null }
}

/** All three keys, each a real value or null. */
export function parseStocking(body: unknown, today: string): Stocking {
  const bad = () => new ApiError(400, 'bad_request')
  const b = (body ?? {}) as Record<string, unknown>
  if (!('stockedOn' in b) || !('count' in b) || !('survival' in b)) throw bad()
  const { stockedOn, count, survival } = b
  if (stockedOn !== null && (!isDay(stockedOn) || stockedOn > today)) throw bad()
  if (count !== null && (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > COUNT_MAX)) throw bad()
  if (survival !== null && (typeof survival !== 'number' || !(survival > 0 && survival <= 1))) throw bad()
  return { stockedOn: stockedOn as string | null, count: count as number | null, survival: survival as number | null }
}

export function pondsRouter(getRepos: GetRepos): Router {
  const r = Router()

  r.get(
    '/ponds',
    handle(getRepos, async ({ repos, ctx }): Promise<PondsResponse> => {
      const { farm, me } = requireFarm(ctx)
      noWorker(me)
      const view = await farmView(repos, farm, me)
      const saved = await repos.scans.savedOfFarm(farm.id, addDays(view.today, -LIST_DAYS))
      const byPond = new Map<string, ScanRow[]>()
      for (const s of saved) if (s.abw !== null) byPond.set(s.pondId, [...(byPond.get(s.pondId) ?? []), s])
      const ponds = view.ponds.map((p) => tileFor(view, p, byPond.get(p.id) ?? []))
      const zones: ZoneSummary[] = [...new Set(ponds.map((t) => t.zone))].map((zone) => {
        const zt = ponds.filter((t) => t.zone === zone)
        return { zone, caretaker: zt[0]?.caretaker ?? null, total: zt.length, photoToday: zt.filter((t) => t.photoToday).length }
      })
      return { zones, ponds }
    }),
  )

  r.get(
    '/ponds/:id',
    handle(getRepos, async ({ req, repos, ctx }): Promise<PondDetail> => {
      const { farm, me } = requireFarm(ctx)
      noWorker(me)
      const view = await farmView(repos, farm, me)
      const pond = pondOf(view.ponds, req.params.id!)
      const scans = await savedScans(repos, pond.id)
      const tile = tileFor(view, pond, scans)
      const cycle = view.cycles.get(pond.id)
      const stockedOn = cycle?.stockedOn ?? null
      const growth: GrowthPoint[] = samplesOf(scans, stockedOn).map((x) => ({ day: stockedOn ? daysBetween(stockedOn, x.date) : 0, abw: x.abw, date: x.date }))
      const latest = scans[0] ? (await summaries(repos, view, scans.slice(0, 2)))[0]! : null
      const noteText = scans[0] ? lastFlag(scans[0].flags, 'note:') : null
      const stocking = stockingOf(cycle)
      const idx = view.ponds.indexOf(pond)
      const prev = view.ponds[idx - 1] ?? null
      const next = view.ponds[idx + 1] ?? null
      return {
        pond: tile,
        growth,
        latest,
        // The per-shrimp sizes come with the stored result (Task 6).
        latestShrimpGrams: [],
        stocking,
        tonnesNow:
          tile.abw !== null && stocking.count !== null && stocking.survival !== null ? round1((stocking.count * stocking.survival * tile.abw) / 1e6) : null,
        note: scans[0] && noteText ? { by: nameOf(view.members, scans[0].lineUserId), at: scans[0].measuredAt ?? scans[0].createdAt, text: noteText } : null,
        prevId: prev?.id ?? null,
        prevCode: prev?.code ?? null,
        nextId: next?.id ?? null,
        nextCode: next?.code ?? null,
        // No model yet; the mock's number is a table by status, and an invented chance is worse than ยังไม่รู้.
        onTimeChance: null,
      }
    }),
  )

  r.get(
    '/ponds/:id/scans',
    handle(getRepos, async ({ req, repos, ctx }) => {
      const { farm, me } = requireFarm(ctx)
      noWorker(me)
      const view = await farmView(repos, farm, me)
      const pond = pondOf(view.ponds, req.params.id!)
      const scans = await savedScans(repos, pond.id)
      return { pond: tileFor(view, pond, scans), scans: await summaries(repos, view, scans) }
    }),
  )

  r.get(
    '/ponds/:id/stocking',
    handle(getRepos, async ({ req, repos, ctx }): Promise<Stocking> => {
      const { farm, me } = requireFarm(ctx)
      noWorker(me)
      const pond = pondOf(await repos.ponds.ofFarm(farm.id), req.params.id!)
      return stockingOf(await repos.cycles.openOf(pond.id))
    }),
  )

  r.put(
    '/ponds/:id/stocking',
    handle(getRepos, async ({ req, repos, ctx }): Promise<Stocking> => {
      const { farm, me } = requireFarm(ctx)
      noWorker(me)
      const pond = pondOf(await repos.ponds.ofFarm(farm.id), req.params.id!)
      const stocking = parseStocking(req.body, bangkokDay())
      await repos.cycles.saveStocking({ farmId: farm.id, pondId: pond.id, farmKey: farm.createdBy, stocking })
      return stockingOf(await repos.cycles.openOf(pond.id))
    }),
  )

  r.put(
    '/ponds/:id/net',
    handle(getRepos, async ({ req, repos, ctx }) => {
      const { farm, me } = requireFarm(ctx)
      noWorker(me)
      const pond = pondOf(await repos.ponds.ofFarm(farm.id), req.params.id!)
      const netId = (req.body as { netId?: unknown } | undefined)?.netId
      if (typeof netId !== 'string' || !netId) throw new ApiError(400, 'bad_request')
      if (!(await repos.nets.ofFarm(farm.id)).some((n) => n.id === netId)) throw new ApiError(404, 'not_found')
      await repos.ponds.setNet(pond.id, netId)
      return undefined
    }),
  )

  return r
}
