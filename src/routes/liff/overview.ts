/**
 * The owner's farm day: GET /overview (O21) with its เรื่องน่าจับตา and
 * PUT|DELETE /watch/:key/ack, GET /team/today (O39, who scanned today), and
 * a person's own list for today, GET /today (W23). Ported from the mock store
 * (liff-app/dev-mock/store.ts overview(), watch(), teamToday(), today()).
 *
 * รับทราบ is farm-wide and holds while the item's signature is the same. It
 * is kept in the farm's settings row (src/domain/settings.ts) because prod
 * has no ack table for this OA.
 */

import { Router } from 'express'
import type {
  Overview,
  PermissionKey,
  PondTile,
  QueueRow,
  TeamPerson,
  TeamPond,
  TeamDay,
  TeamTodayResponse,
  TodayResponse,
  WatchAck,
  WatchItem,
} from '../../contract/types.js'
import { TH } from '../../copy/th.js'
import { ApiError, requireFarm } from '../../data/context.js'
import type { FarmSettings, MemberRow, Repos, ScanRow } from '../../data/types.js'
import { addDays, zoneOf } from '../../domain/farm.js'
import { fmtDay, fmtTime, pondsLabel } from '../../domain/format.js'
import { effective } from '../../domain/permissions.js'
import { REMIND_AT } from '../../domain/settings.js'
import { handle, type GetRepos } from './handle.js'
import { oneAtATime } from './lock.js'
import { farmTiles, farmView, nameOf, type FarmView } from './ponds.js'

/** Ponds within this many days go on the soon list; within LATER_DAYS on the later list. */
const SOON_DAYS = 5
const LATER_DAYS = 14
/** A harvest within this many days gets its own เรื่องน่าจับตา row. */
const HARVEST_ROW_DAYS = 3
/** Survival when the stocking has none: the mock's tonnes use it too. */
const SURVIVAL_GUESS = 0.8

const round1 = (n: number) => Math.round(n * 10) / 10

/** 403 not_allowed unless the person has this switch on (the owner always has). */
export function need(me: MemberRow, key: PermissionKey): void {
  if (!(me.perms ?? effective(me.role))[key]) throw new ApiError(403, 'not_allowed')
}

/** Tonnes at the target size: count × survival × target grams; 0 while the stocking count is unknown. */
function tonnesOf(view: FarmView, pondId: string): number {
  const c = view.cycles.get(pondId)
  if (!c?.count) return 0
  return round1((c.count * (c.survival ?? SURVIVAL_GUESS) * (1000 / view.targetPerKg)) / 1e6)
}

/** The ack this item carries: the stored one while its signature still matches. */
function withAcks(items: Omit<WatchItem, 'acked'>[], acks: FarmSettings['acks']): WatchItem[] {
  return items.map((i) => {
    const a = i.ackable ? acks[i.key] : undefined
    return { ...i, acked: a && a.signature === i.signature ? { by: a.by, at: a.at } : null }
  })
}

/**
 * เรื่องน่าจับตา: ponds to harvest in the next 3 days (one row each), the
 * ponds not scanned yet today, then the slow ones. Today's rows first.
 */
function watchOf(tiles: PondTile[], soon: QueueRow[]): Omit<WatchItem, 'acked'>[] {
  const items: (Omit<WatchItem, 'acked'> & { rank: number })[] = []
  for (const r of soon) {
    const t = tiles.find((x) => x.id === r.pondId)!
    const days = t.daysToTarget!
    if (days > HARVEST_ROW_DAYS) continue
    const when = days === 0 ? 'วันนี้' : days === 1 ? 'พรุ่งนี้' : fmtDay(r.date)
    items.push({
      rank: days === 0 ? 0 : 2 + days,
      key: `harvest-${t.code}`,
      kind: 'harvest',
      title: `โทรนัดห้องเย็น จับบ่อ ${t.code}`,
      chip: days === 0 ? 'วันนี้' : days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`,
      tone: days === 0 ? 'soon' : 'plain',
      // No tonnes while the stocking count is unknown: "ราว 0 ตัน" would read as an empty pond.
      detail: `ถึงไซส์ **${r.perKg} ตัว/กก.** ${when}${r.tonnes ? ` · ราว **${r.tonnes} ตัน**` : ''}${t.caretaker ? ` · ${t.caretaker} ดูแลโซน ${t.zone}` : ''}`,
      auto: null,
      action: { label: `เปิดบ่อ ${t.code}`, to: 'pond', pondId: t.id },
      ackable: true,
      signature: `${r.date}:${r.perKg}`,
    })
  }
  const missing = tiles.filter((t) => t.status === 'missing')
  if (missing.length) {
    const names = [...new Set(missing.map((t) => t.caretaker).filter((x): x is string => !!x))]
    const who = names.length > 1 ? `${names.slice(0, -1).join(' ')} กับ${names[names.length - 1]}` : (names[0] ?? '')
    const codes = missing.map((t) => t.code).join(' · ')
    items.push({
      rank: 1,
      key: 'missing',
      kind: 'missing',
      title: missing.length === 1 ? `บ่อ ${missing[0]!.code} ยังไม่ได้สแกนวันนี้` : `${missing.length} บ่อยังไม่ได้สแกนวันนี้`,
      chip: 'วันนี้',
      tone: 'soon',
      detail: `**${codes}**${who ? ` · ${who} ดูแลอยู่` : ''}`,
      auto: 'หายไปเองเมื่อสแกนแล้วค่ะ',
      action: { label: 'ดูว่าใครสแกนแล้ว', to: 'team' },
      ackable: false,
      signature: codes,
    })
  }
  const slow = tiles.filter((t) => t.status === 'urgent')
  if (slow.length) {
    const codes = slow.map((t) => t.code).join(' · ')
    items.push({
      rank: 9,
      key: 'slow',
      kind: 'slow',
      title: `${slow.length} บ่อโตช้าหรือแตกไซส์`,
      chip: 'ตรวจดู',
      tone: 'alert',
      detail: `**${codes}** โตช้ากว่าที่ควร หรือไซส์ในบ่อไม่เสมอ`,
      auto: null,
      action: { label: 'ดูบ่อที่ต้องดู', to: 'urgent' },
      ackable: true,
      signature: codes,
    })
  }
  return items.sort((a, b) => a.rank - b.rank).map(({ rank: _rank, ...i }) => i)
}

/** The overview from the farm's tiles; `acks` from its settings. */
export function overviewOf(view: FarmView, tiles: PondTile[], acks: FarmSettings['acks']): Overview {
  const row = (t: PondTile): QueueRow => ({ pondId: t.id, pondCode: t.code, date: t.reachOn!, perKg: t.perKg!, abw: t.abw!, tonnes: tonnesOf(view, t.id) })
  const known = tiles
    .filter((t) => t.daysToTarget !== null && t.reachOn !== null && t.perKg !== null && t.abw !== null)
    .sort((a, b) => a.daysToTarget! - b.daysToTarget! || a.code.localeCompare(b.code))
  const soon = known.filter((t) => t.daysToTarget! <= SOON_DAYS).map(row)
  const later = known.filter((t) => t.daysToTarget! > SOON_DAYS && t.daysToTarget! <= LATER_DAYS).map(row)
  const sum = (rows: QueueRow[]) => round1(rows.reduce((a, r) => a + r.tonnes, 0))
  const band = (from: number, to: number | null) => {
    const xs = known.filter((t) => t.daysToTarget! >= from && (to === null || t.daysToTarget! <= to))
    return { from, to, ponds: xs.length, tonnes: round1(xs.reduce((a, t) => a + tonnesOf(view, t.id), 0)) }
  }
  const ready = tiles.filter((t) => t.status === 'ready')
  const urgent = tiles.filter((t) => t.status === 'urgent')
  const missing = tiles.filter((t) => t.status === 'missing')
  return {
    farmName: view.farm.name,
    today: view.today,
    pondCount: tiles.length,
    targetPerKg: view.targetPerKg,
    watch: withAcks(watchOf(tiles, soon), acks),
    tiles: {
      ready: { n: ready.length, tonnes: round1(ready.reduce((a, t) => a + tonnesOf(view, t.id), 0)) },
      good: { n: tiles.filter((t) => t.status === 'good').length },
      watch: { n: tiles.filter((t) => t.status === 'watch').length },
      urgent: { n: urgent.length + missing.length, slow: urgent.length, missing: missing.length },
    },
    photosToday: { sent: tiles.filter((t) => t.photoToday).length, total: tiles.length, missing: missing.map((t) => t.code) },
    queueDays: Array.from({ length: LATER_DAYS }, (_, i) => {
      const date = addDays(view.today, i)
      return { date, n: known.filter((t) => t.reachOn === date).length }
    }),
    soon: { rows: soon, tonnes: sum(soon) },
    later: { rows: later, tonnes: sum(later) },
    beyond: [band(LATER_DAYS + 1, 25), band(26, null)].filter((b) => b.ponds > 0),
  }
}

/** Each pond's scan saved today (the latest when there were two), by pond id. */
export async function savedTodayByPond(repos: Repos, farmId: string, today: string): Promise<Map<string, ScanRow>> {
  const out = new Map<string, ScanRow>()
  for (const s of await repos.scans.savedOfFarm(farmId, today)) if (s.sampleDate === today && !out.has(s.pondId)) out.set(s.pondId, s)
  return out
}

/** The ponds this person is asked to scan: every pond for the owner, else the ones they look after. */
function myPondIds(view: FarmView): Set<string> {
  return new Set(view.me.role === 'owner' ? view.ponds.map((p) => p.id) : view.me.pondIds)
}

const savedAt = (s: ScanRow) => s.measuredAt ?? s.createdAt

/** สแกนวันนี้'s grid looks back this many weeks. */
const HISTORY_WEEKS = 13

/** Ponds of the farm scanned each day since `since`, oldest first; a day with none is left out. */
export function scanDays(saved: { pondId: string; sampleDate: string | null }[], pondIds: Set<string>, since: string): TeamDay[] {
  const byDay = new Map<string, Set<string>>()
  for (const s of saved) {
    if (!s.sampleDate || s.sampleDate < since || !pondIds.has(s.pondId)) continue
    const set = byDay.get(s.sampleDate) ?? new Set<string>()
    set.add(s.pondId)
    byDay.set(s.sampleDate, set)
  }
  return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, set]) => ({ date, done: set.size }))
}

export function overviewRouter(getRepos: GetRepos): Router {
  const r = Router()

  r.get(
    '/overview',
    handle(getRepos, async ({ repos, ctx }): Promise<Overview> => {
      const { farm, me } = requireFarm(ctx)
      need(me, 'farmOverview')
      const view = await farmView(repos, farm, me)
      const [tiles, settings] = await Promise.all([farmTiles(repos, view), repos.settings.read(farm.id)])
      return overviewOf(view, tiles, settings.acks)
    }),
  )

  r.put(
    '/watch/:key/ack',
    handle(getRepos, async ({ req, repos, ctx }): Promise<WatchAck> => {
      const { farm, me } = requireFarm(ctx)
      need(me, 'farmOverview')
      const signature = (req.body as { signature?: unknown } | undefined)?.signature
      if (typeof signature !== 'string' || !signature) throw new ApiError(400, 'bad_request')
      const key = req.params.key!
      return oneAtATime(`settings:${farm.id}`, async () => {
        const view = await farmView(repos, farm, me)
        const [tiles, settings] = await Promise.all([farmTiles(repos, view), repos.settings.read(farm.id)])
        const items = overviewOf(view, tiles, settings.acks).watch
        if (!items.some((w) => w.key === key && w.ackable)) throw new ApiError(404, 'not_found')
        const ack = { by: me.name || (me.role === 'owner' ? TH.ownerFallback : TH.someone), at: fmtTime(new Date()) }
        // Acks of items that are gone (a pond harvested, a slow list that changed key) go with this write.
        const live = new Set(items.map((w) => w.key))
        const acks = Object.fromEntries(Object.entries(settings.acks).filter(([k]) => live.has(k)))
        await repos.settings.write(farm.id, { ...settings, acks: { ...acks, [key]: { signature, ...ack } } })
        return ack
      })
    }),
  )

  r.delete(
    '/watch/:key/ack',
    handle(getRepos, async ({ req, repos, ctx }) => {
      const { farm, me } = requireFarm(ctx)
      need(me, 'farmOverview')
      const key = req.params.key!
      await oneAtATime(`settings:${farm.id}`, async () => {
        const settings = await repos.settings.read(farm.id)
        if (!(key in settings.acks)) return
        const { [key]: _gone, ...acks } = settings.acks
        await repos.settings.write(farm.id, { ...settings, acks })
      })
      return undefined
    }),
  )

  r.get(
    '/today',
    handle(getRepos, async ({ repos, ctx }): Promise<TodayResponse> => {
      const { farm, me } = requireFarm(ctx)
      const view = await farmView(repos, farm, me)
      const mine = myPondIds(view)
      const today = await savedTodayByPond(repos, farm.id, view.today)
      const ponds = view.ponds.filter((p) => mine.has(p.id))
      const urls = await repos.photos.urls(ponds.flatMap((p) => today.get(p.id)?.imageFileId ?? []))
      const rows = ponds.map((p) => {
        const s = today.get(p.id)
        return {
          pondId: p.id,
          pondCode: p.code,
          netId: p.netId ?? view.nets[0]?.id ?? null,
          scanId: s?.id ?? null,
          by: s ? nameOf(view.members, s.lineUserId) : null,
          at: s ? savedAt(s) : null,
          photoUrl: s?.imageFileId ? (urls[s.imageFileId] ?? null) : null,
        }
      })
      return { done: rows.filter((x) => x.scanId).length, total: rows.length, rows }
    }),
  )

  r.get(
    '/team/today',
    handle(getRepos, async ({ repos, ctx }): Promise<TeamTodayResponse> => {
      const { farm, me } = requireFarm(ctx)
      need(me, 'farmOverview')
      const view = await farmView(repos, farm, me)
      const since = addDays(view.today, -(HISTORY_WEEKS * 7 - 1))
      const [today, settings, days] = await Promise.all([
        savedTodayByPond(repos, farm.id, view.today),
        repos.settings.read(farm.id),
        repos.scans.scanDays(farm.id, since),
      ])
      const pondRow = (p: { id: string; code: string }): TeamPond => {
        const s = today.get(p.id)
        return { pondId: p.id, pondCode: p.code, at: s ? savedAt(s) : null, by: s ? nameOf(view.members, s.lineUserId) : null }
      }
      const people: TeamPerson[] = []
      for (const m of view.members) {
        if (m.role === 'owner') continue
        const theirs = view.ponds.filter((p) => m.pondIds.includes(p.id))
        if (!theirs.length) continue
        const ponds = theirs.map(pondRow)
        const times = ponds.map((x) => x.at).filter((x): x is string => x !== null).sort()
        people.push({
          memberId: m.id,
          name: m.name || TH.someone,
          role: m.role,
          pondsLabel: pondsLabel(theirs.map((p) => p.code), zoneOf),
          done: times.length,
          total: ponds.length,
          lastAt: times[times.length - 1] ?? null,
          ponds,
        })
      }
      // People with ponds left first, in the farm's order; the finished after them.
      people.sort((a, b) => Number(a.done === a.total) - Number(b.done === b.total))
      const held = new Set(people.flatMap((x) => x.ponds.map((p) => p.pondId)))
      const all = view.ponds.map(pondRow)
      return {
        today: view.today,
        done: all.filter((x) => x.at).length,
        total: all.length,
        people,
        nobody: all.filter((x) => !held.has(x.pondId)),
        remindAt: settings.notify.remindWorkers ? REMIND_AT : null,
        history: scanDays(days, new Set(view.ponds.map((p) => p.id)), since),
      }
    }),
  )

  return r
}
