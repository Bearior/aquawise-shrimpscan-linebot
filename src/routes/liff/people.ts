/**
 * คนในฟาร์ม (O7 to O11, O40): GET /members; the owner's PATCH|DELETE
 * /members/:id, GET|PUT /members/:id/ponds and GET|PATCH
 * /members/:id/permissions; invites: POST /invites, DELETE /invites/:code,
 * and for the person joining, GET /invites/:code and POST
 * /invites/:code/accept. Ported from the mock store (liff-app/dev-mock/store.ts).
 *
 * Invites live in `farm_invites` beside น้องน้ำ's, keyed by the farm's owner
 * (the farm key). The OA shows or takes only an invite whose key holds a farm
 * this OA made, and its link carries the six-character code, never the token
 * น้องน้ำ's own links use. Joining writes the membership the way line-bot's
 * accept does (upsert on the farm key and the person), after the guard: a
 * person with any footing in น้องน้ำ cannot join here (403 use_nong_nam).
 *
 * A pond has one caretaker: ponds given to one person leave whoever had them.
 */

import { randomBytes } from 'node:crypto'
import { Router, type Request } from 'express'
import type {
  Invite,
  InviteCreate,
  InvitePreview,
  Member,
  MemberPondsResponse,
  MembersResponse,
  Permissions,
  PermissionsResponse,
  Role,
  Session,
} from '../../contract/types.js'
import { TH } from '../../copy/th.js'
import { ApiError, requireFarm, resolveContext } from '../../data/context.js'
import type { FarmRow, InviteRow, MemberRow, Repos, ScanRow } from '../../data/types.js'
import { bangkokDay, daysBetween, zoneOf } from '../../domain/farm.js'
import { fmtDay, fmtDayYear, fmtTime, pondsLabel } from '../../domain/format.js'
import { DEFAULTS } from '../../domain/permissions.js'
import { PERMISSION_KEYS, permsOf } from '../../domain/settings.js'
import { liffUrl } from '../../handlers/webhook.js'
import { handle, type GetRepos } from './handle.js'
import { oneAtATime } from './lock.js'
import { savedTodayByPond } from './overview.js'
import { picturesOf } from './profile.js'
import { sessionFor } from './session.js'

/** line-bot's INVITE_TTL_DAYS. */
const INVITE_DAYS = 7
/** line-bot's invite code (CHAR(6)) and token alphabets and lengths. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const PONDS_MAX = 300
const NAME_MAX = 80
/** The latest joins shown under the people list. */
const ACTIVITY_MAX = 6

type Helper = Exclude<Role, 'owner'>

const bad = () => new ApiError(400, 'bad_request')

function pick(alphabet: string, n: number): string {
  const buf = randomBytes(n)
  let out = ''
  for (let i = 0; i < n; i++) out += alphabet[buf[i]! % alphabet.length]
  return out
}

function ownerOnly(me: MemberRow): void {
  if (me.role !== 'owner') throw new ApiError(403, 'not_allowed')
}

const isHelper = (x: unknown): x is Helper => x === 'manager' || x === 'worker'

function displayName(m: MemberRow): string {
  return m.name || (m.role === 'owner' ? TH.ownerFallback : TH.someone)
}

/** Owner first, then everyone else in the order they joined. */
function ordered(members: MemberRow[]): MemberRow[] {
  return [...members.filter((m) => m.role === 'owner'), ...members.filter((m) => m.role !== 'owner')]
}

interface People {
  farm: FarmRow
  me: MemberRow
  members: MemberRow[]
  ponds: { id: string; code: string }[]
  today: string
}

async function peopleOf(repos: Repos, farm: FarmRow, me: MemberRow): Promise<People> {
  const [members, ponds] = await Promise.all([repos.members.ofFarm(farm.id), repos.ponds.ofFarm(farm.id)])
  return { farm, me, members: ordered(members), ponds, today: bangkokDay() }
}

function codesOf(p: People, ids: string[]): string[] {
  return p.ponds.filter((x) => ids.includes(x.id)).map((x) => x.code)
}

function memberView(p: People, m: MemberRow, savedToday: Map<string, ScanRow>, pictures: Map<string, string>): Member {
  const theirs = p.ponds.filter((x) => m.pondIds.includes(x.id))
  const zones = [...new Set(theirs.map((x) => zoneOf(x.code)))]
  const done = theirs.filter((x) => savedToday.has(x.id)).length
  const scope =
    m.role === 'owner'
      ? 'ทุกบ่อ'
      : m.role === 'manager'
        ? `ดูแล ${theirs.length} บ่อ${zones.length ? ` · โซน ${zones.join(' และ ')}` : ''}`
        : `ดูแล ${theirs.length} บ่อ · วันนี้ ${done}/${theirs.length}`
  return {
    id: m.id,
    name: displayName(m),
    pictureUrl: pictures.get(m.lineUserId) ?? null,
    role: m.role,
    scope,
    joined: m.role === 'owner' ? 'เจ้าของฟาร์ม' : m.joinedAt ? `เข้าร่วม ${fmtDayYear(bangkokDay(new Date(m.joinedAt)))}` : 'เข้าร่วมแล้ว',
    isYou: m.id === p.me.id,
  }
}

function inviteLink(req: Request, code: string): string {
  const liff = liffUrl()
  return liff ? `${liff}/app/join?invite=${code}` : `${req.protocol}://${req.get('host')}/liff/app/join?invite=${code}`
}

function inviteView(req: Request, p: People, inv: InviteRow): Invite {
  const expiresOn = bangkokDay(new Date(inv.expiresAt))
  return {
    code: inv.code,
    url: inviteLink(req, inv.code),
    role: inv.role,
    pondsLabel: pondsLabel(codesOf(p, inv.pondIds), zoneOf),
    expiresOn,
    daysLeft: Math.max(0, daysBetween(p.today, expiresOn)),
  }
}

/** Why an invite cannot be taken, or null when it can. */
function closedReason(inv: InviteRow, members: MemberRow[]): InvitePreview['reason'] | null {
  if (inv.status === 'claimed') return 'used'
  if (inv.status === 'cancelled' || inv.status === 'declined') return 'cancelled'
  if (inv.status === 'expired' || Date.parse(inv.expiresAt) <= Date.now()) return 'expired'
  // An invite is only as good as its issuer's membership (line-bot migration 204).
  if (inv.createdBy && !members.some((m) => m.lineUserId === inv.createdBy)) return 'cancelled'
  return null
}

/** The invite and the OA farm it is for; 404 invite_invalid for a code that is neither. */
async function findInvite(repos: Repos, raw: string): Promise<{ inv: InviteRow; farm: FarmRow }> {
  const code = raw.toUpperCase().replace(/[\s-]/g, '')
  if (!CODE.test(code)) throw new ApiError(404, 'invite_invalid')
  const inv = await repos.invites.byCode(code)
  const farm = inv ? await repos.farms.oaFarmOfKey(inv.farmKey) : null
  if (!inv || !farm) throw new ApiError(404, 'invite_invalid')
  return { inv, farm }
}

/** The member row an owner may change: someone else in the farm, never the owner. */
async function helperOf(repos: Repos, farm: FarmRow, id: string): Promise<MemberRow> {
  const m = await repos.members.byId(farm.id, id)
  if (!m) throw new ApiError(404, 'not_found')
  if (m.role === 'owner') throw new ApiError(403, 'not_allowed')
  return m
}

/** These ponds leave everyone `keep` does not name: one caretaker a pond. */
async function takePonds(repos: Repos, farmId: string, ids: string[], keep: (m: MemberRow) => boolean): Promise<void> {
  if (!ids.length) return
  for (const x of await repos.members.ofFarm(farmId)) {
    if (x.role === 'owner' || keep(x) || !x.pondIds.some((id) => ids.includes(id))) continue
    await repos.members.setPonds(x.id, x.pondIds.filter((id) => !ids.includes(id)))
  }
}

/** The body's pond ids, kept to the farm's own ponds in the farm's order. */
function parsePondIds(raw: unknown, ponds: { id: string }[]): string[] {
  if (!Array.isArray(raw) || raw.length > PONDS_MAX || raw.some((x) => typeof x !== 'string')) throw bad()
  const wanted = new Set(raw as string[])
  return ponds.filter((p) => wanted.has(p.id)).map((p) => p.id)
}

/** Drops the owner's switches for one person, so their role's defaults apply again. */
async function resetPerms(repos: Repos, farmId: string, memberId: string): Promise<void> {
  await oneAtATime(`settings:${farmId}`, async () => {
    const settings = await repos.settings.read(farmId)
    if (!(memberId in settings.perms)) return
    const { [memberId]: _gone, ...perms } = settings.perms
    await repos.settings.write(farmId, { ...settings, perms })
  })
}

export function peopleRouter(getRepos: GetRepos): Router {
  const r = Router()

  r.get(
    '/members',
    handle(getRepos, async ({ req, repos, ctx }): Promise<MembersResponse> => {
      const { farm, me } = requireFarm(ctx)
      const p = await peopleOf(repos, farm, me)
      const [savedToday, invites, pictures] = await Promise.all([
        savedTodayByPond(repos, farm.id, p.today),
        me.role === 'owner' ? repos.invites.pendingOf(farm.createdBy) : Promise.resolve([] as InviteRow[]),
        picturesOf(repos, p.members),
      ])
      const covered = new Set(p.members.filter((m) => m.role !== 'owner').flatMap((m) => codesOf(p, m.pondIds).map(zoneOf)))
      const joins = p.members
        .filter((m) => m.role !== 'owner' && m.joinedAt)
        .sort((a, b) => b.joinedAt!.localeCompare(a.joinedAt!))
        .slice(0, ACTIVITY_MAX)
      return {
        members: p.members.map((m) => memberView(p, m, savedToday, pictures)),
        invites: invites.filter((i) => closedReason(i, p.members) === null).map((i) => inviteView(req, p, i)),
        activity: joins.map((m) => {
          const day = bangkokDay(new Date(m.joinedAt!))
          return { who: displayName(m), what: 'เข้าร่วมฟาร์ม', when: day === p.today ? `วันนี้ ${fmtTime(m.joinedAt!)}` : fmtDay(day) }
        }),
        uncoveredZones: [...new Set(p.ponds.map((x) => zoneOf(x.code)))].filter((z) => !covered.has(z)),
      }
    }),
  )

  r.patch(
    '/members/:id',
    handle(getRepos, async ({ req, repos, ctx }) => {
      const { farm, me } = requireFarm(ctx)
      ownerOnly(me)
      const role = (req.body as { role?: unknown } | undefined)?.role
      if (!isHelper(role)) throw bad()
      const m = await helperOf(repos, farm, req.params.id!)
      await repos.members.setRole(m.id, role)
      await resetPerms(repos, farm.id, m.id)
      return undefined
    }),
  )

  r.delete(
    '/members/:id',
    handle(getRepos, async ({ req, repos, ctx }) => {
      const { farm, me } = requireFarm(ctx)
      ownerOnly(me)
      const m = await helperOf(repos, farm, req.params.id!)
      await repos.members.remove(m.id)
      await resetPerms(repos, farm.id, m.id)
      return undefined
    }),
  )

  const pondsView = async (repos: Repos, p: People, m: MemberRow): Promise<MemberPondsResponse> => ({
    member: memberView(p, m, await savedTodayByPond(repos, p.farm.id, p.today), await picturesOf(repos, [m])),
    pondIds: p.ponds.filter((x) => m.pondIds.includes(x.id)).map((x) => x.id),
    ponds: p.ponds.map((x) => ({
      id: x.id,
      code: x.code,
      zone: zoneOf(x.code),
      heldBy: (() => {
        const h = p.members.find((o) => o.id !== m.id && o.role !== 'owner' && o.pondIds.includes(x.id))
        return h ? displayName(h) : null
      })(),
    })),
  })

  r.get(
    '/members/:id/ponds',
    handle(getRepos, async ({ req, repos, ctx }) => {
      const { farm, me } = requireFarm(ctx)
      ownerOnly(me)
      const m = await helperOf(repos, farm, req.params.id!)
      return pondsView(repos, await peopleOf(repos, farm, me), m)
    }),
  )

  r.put(
    '/members/:id/ponds',
    handle(getRepos, async ({ req, repos, ctx }) => {
      const { farm, me } = requireFarm(ctx)
      ownerOnly(me)
      const m = await helperOf(repos, farm, req.params.id!)
      const ids = parsePondIds((req.body as { pondIds?: unknown } | undefined)?.pondIds, await repos.ponds.ofFarm(farm.id))
      await oneAtATime(`members:${farm.id}`, async () => {
        await takePonds(repos, farm.id, ids, (x) => x.id === m.id)
        await repos.members.setPonds(m.id, ids)
      })
      const p = await peopleOf(repos, farm, me)
      return pondsView(repos, p, p.members.find((x) => x.id === m.id) ?? { ...m, pondIds: ids })
    }),
  )

  const permissionsView = async (repos: Repos, farm: FarmRow, me: MemberRow, id: string): Promise<PermissionsResponse> => {
    const [p, m, settings] = await Promise.all([peopleOf(repos, farm, me), repos.members.byId(farm.id, id), repos.settings.read(farm.id)])
    if (!m) throw new ApiError(404, 'not_found')
    return {
      member: memberView(p, m, await savedTodayByPond(repos, farm.id, p.today), await picturesOf(repos, [m])),
      pondsLabel: pondsLabel(codesOf(p, m.pondIds), zoneOf),
      perms: permsOf(settings, m),
      defaults: DEFAULTS[m.role],
    }
  }

  r.get(
    '/members/:id/permissions',
    handle(getRepos, async ({ req, repos, ctx }) => {
      const { farm, me } = requireFarm(ctx)
      ownerOnly(me)
      return permissionsView(repos, farm, me, req.params.id!)
    }),
  )

  r.patch(
    '/members/:id/permissions',
    handle(getRepos, async ({ req, repos, ctx }) => {
      const { farm, me } = requireFarm(ctx)
      ownerOnly(me)
      const m = await helperOf(repos, farm, req.params.id!)
      const b = (req.body ?? {}) as Record<string, unknown>
      if ('key' in b) {
        if (typeof b.key !== 'string' || !(PERMISSION_KEYS as readonly string[]).includes(b.key) || typeof b.value !== 'boolean') throw bad()
        const key = b.key as keyof Permissions
        const value = b.value
        await oneAtATime(`settings:${farm.id}`, async () => {
          const settings = await repos.settings.read(farm.id)
          const now = settings.perms[m.id] ?? DEFAULTS[m.role]
          await repos.settings.write(farm.id, { ...settings, perms: { ...settings.perms, [m.id]: { ...now, [key]: value } } })
        })
      } else if ('role' in b) {
        if (!isHelper(b.role)) throw bad()
        await repos.members.setRole(m.id, b.role)
        await resetPerms(repos, farm.id, m.id)
      } else if (b.reset === true) {
        await resetPerms(repos, farm.id, m.id)
      } else throw bad()
      return permissionsView(repos, farm, me, m.id)
    }),
  )

  r.post(
    '/invites',
    handle(getRepos, async ({ req, repos, ctx }): Promise<Invite> => {
      const { farm, me } = requireFarm(ctx)
      ownerOnly(me)
      const b = (req.body ?? {}) as Partial<InviteCreate>
      if (!isHelper(b.role)) throw bad()
      const p = await peopleOf(repos, farm, me)
      const pondIds = parsePondIds(b.pondIds ?? [], p.ponds)
      const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString()
      // The code is unique across every farm, น้องน้ำ's included: draw again on a clash.
      for (let attempt = 0; attempt < 5; attempt++) {
        const made = await repos.invites.create({
          farmKey: farm.createdBy,
          createdBy: me.lineUserId,
          code: pick(CODE_ALPHABET, 6),
          token: pick(TOKEN_ALPHABET, 22),
          role: b.role,
          pondIds,
          expiresAt,
        })
        if (made !== 'code_taken') return inviteView(req, p, made)
      }
      throw new Error('[invites] no free code after 5 draws')
    }),
  )

  r.delete(
    '/invites/:code',
    handle(getRepos, async ({ req, repos, ctx }) => {
      const { farm, me } = requireFarm(ctx)
      ownerOnly(me)
      const code = req.params.code!.toUpperCase().replace(/[\s-]/g, '')
      if (!CODE.test(code) || !(await repos.invites.cancel(farm.createdBy, code))) throw new ApiError(404, 'not_found')
      return undefined
    }),
  )

  r.get(
    '/invites/:code',
    handle(getRepos, async ({ req, repos, ctx }): Promise<InvitePreview> => {
      if (ctx.blocked) throw new ApiError(403, 'use_nong_nam')
      const { inv, farm } = await findInvite(repos, req.params.code!)
      const [members, ponds] = await Promise.all([repos.members.ofFarm(farm.id), repos.ponds.ofFarm(farm.id)])
      const owner = members.find((m) => m.role === 'owner' && m.lineUserId === farm.createdBy) ?? members.find((m) => m.role === 'owner')
      const codes = ponds.filter((p) => inv.pondIds.includes(p.id)).map((p) => p.code)
      const reason = closedReason(inv, members)
      return {
        code: inv.code,
        farmName: farm.name,
        pondCount: ponds.length,
        ownerName: owner?.name || TH.ownerFallback,
        role: inv.role,
        pondsLabel: codes.length ? `${pondsLabel(codes, zoneOf)} · ${codes.length} บ่อ` : 'ทุกบ่อ',
        suggestedName: req.lineDisplayName ?? '',
        valid: reason === null,
        ...(reason ? { reason } : {}),
      }
    }),
  )

  r.post(
    '/invites/:code/accept',
    handle(getRepos, async ({ req, repos, ctx }): Promise<Session> => {
      if (ctx.blocked) throw new ApiError(403, 'use_nong_nam')
      const typed = (req.body as { displayName?: unknown } | undefined)?.displayName
      if (typed !== undefined && (typeof typed !== 'string' || typed.trim().length > NAME_MAX)) throw bad()
      const name = (typeof typed === 'string' && typed.trim()) || req.lineDisplayName?.trim() || null
      const lineUserId = req.lineUserId!
      // One accept at a time per person: a double tap joins once.
      const done = await oneAtATime(`join:${lineUserId}`, async () => {
        const now = await resolveContext(repos, lineUserId)
        if (now.blocked) throw new ApiError(403, 'use_nong_nam')
        const { inv, farm } = await findInvite(repos, req.params.code!)
        if (now.farm) {
          // Already in this farm: the link was opened twice. In another farm: one farm a person.
          if (now.farm.id === farm.id) return now
          throw new ApiError(409, 'already_has_farm')
        }
        const members = await repos.members.ofFarm(farm.id)
        if (inv.farmKey === lineUserId || closedReason(inv, members) !== null) throw new ApiError(409, 'invite_invalid')
        // farm_members.member_line_user_id references line_users; a new OA person is scan_only like the owner.
        await repos.people.stampScanOnly(lineUserId, name)
        if (!(await repos.invites.claim(inv.id, lineUserId))) throw new ApiError(409, 'invite_invalid')
        const pondIds = (await repos.ponds.ofFarm(farm.id)).filter((p) => inv.pondIds.includes(p.id)).map((p) => p.id)
        try {
          await repos.members.join({ farmId: farm.id, farmKey: inv.farmKey, lineUserId, role: inv.role, name, pondIds, inviteId: inv.id })
        } catch (err) {
          await repos.invites.unclaim(inv.id)
          throw err
        }
        await oneAtATime(`members:${farm.id}`, () => takePonds(repos, farm.id, pondIds, (x) => x.lineUserId === lineUserId))
        return resolveContext(repos, lineUserId)
      })
      return sessionFor(repos, done, req.lineDisplayName)
    }),
  )

  return r
}
