/**
 * In-memory repositories for the route tests. The state is plain arrays the
 * test can seed and read back, so a test asserts what was written, not which
 * calls were made.
 *
 * It keeps the rules the database keeps (the guard's footprint, the erased
 * account, the scan_only stamp) and yields between writes, so two requests at
 * once interleave the way they would against the database.
 */

import { DEFAULT_TARGET_PER_KG } from '../domain/farm.js'
import { settingsFromJson, settingsToJson } from '../domain/settings.js'
import { ApiError } from './context.js'
import {
  OA_CREATED_VIA,
  UNMEASURED,
  type CycleRow,
  type FarmRow,
  type GrowthDayInput,
  type InviteRow,
  type MemberRow,
  type NetRow,
  type PondRow,
  type Repos,
  type ScanPatch,
  type ScanRow,
} from './types.js'

/** The few `line_users` facts the server reads or writes. */
export interface MemoryLineUser {
  id: string
  platformAccess: 'full' | 'scan_only'
  signupSource: string | null
  /** `onboarding_complete`: finished น้องน้ำ onboarding. */
  onboarded: boolean
  /** `dsr_erased_at` is set. */
  erased: boolean
}

/** A `cycles` row: open or closed, with the farm key that wrote it. */
export interface MemoryCycle extends CycleRow {
  farmId: string
  lineUserId?: string
  open: boolean
}

/** A `sizing_measurements` row as the memory store keeps it, with the columns only a write sets. */
export interface MemoryScan extends ScanRow, Omit<ScanPatch, keyof ScanRow> {
  sha256?: string
}

/** A `growth_samples` row that `write_photo_growth_sample` keeps (or another source's, seeded). */
export interface MemoryGrowth extends GrowthDayInput {
  source: string
}

/** A `record_image_files` row. */
export interface MemoryImageFile {
  id: string
  farmId: string
  lineUserId: string
  ref: string
  kind: string
  mime: string
  bytes: number
  pondIds: string[]
}

/** A `farm_invites` row, with the token only the database keeps. */
export interface MemoryInvite extends InviteRow {
  token: string
  claimedBy?: string | null
}

export interface MemoryState {
  farms: FarmRow[]
  members: MemberRow[]
  ponds: PondRow[]
  nets: NetRow[]
  scans: MemoryScan[]
  /** Storage objects by path. */
  objects: Record<string, { mime: string; bytes: number; data: Buffer }>
  imageFiles: MemoryImageFile[]
  /** Storage refuses every put (the bucket is down). */
  failPhotoPut: boolean
  cycles: MemoryCycle[]
  lineUsers: MemoryLineUser[]
  /** `shrimp_scan_farm_settings.target_per_kg` by farm id. */
  targets: Record<string, number>
  /** Scans used today by farm id. */
  quotaUsed: Record<string, number>
  /** The quota cannot be read (the RPC failed). */
  quotaDown: boolean
  growth: MemoryGrowth[]
  invites: MemoryInvite[]
  /** `shrimp_scan_farm_settings.notify` by farm id, as stored. */
  settings: Record<string, unknown>
}

export type MemoryRepos = Repos & { state: MemoryState }

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

export function createMemoryRepos(seed: Partial<MemoryState> = {}): MemoryRepos {
  const state: MemoryState = {
    farms: [...(seed.farms ?? [])],
    members: (seed.members ?? []).map((m) => ({ ...m, pondIds: [...m.pondIds] })),
    ponds: (seed.ponds ?? []).map((p) => ({ ...p })),
    nets: (seed.nets ?? []).map((n) => ({ ...n })),
    scans: (seed.scans ?? []).map((s) => ({ ...s })),
    objects: { ...seed.objects },
    imageFiles: (seed.imageFiles ?? []).map((f) => ({ ...f })),
    failPhotoPut: seed.failPhotoPut ?? false,
    cycles: (seed.cycles ?? []).map((c) => ({ ...c })),
    lineUsers: (seed.lineUsers ?? []).map((u) => ({ ...u })),
    targets: { ...seed.targets },
    quotaUsed: { ...seed.quotaUsed },
    quotaDown: seed.quotaDown ?? false,
    growth: (seed.growth ?? []).map((g) => ({ ...g })),
    invites: (seed.invites ?? []).map((i) => ({ ...i })),
    settings: { ...seed.settings },
  }
  let seq = 0
  /** Open quota charges: scan id to farm id (sizing_quota_charges with no refunded_at). */
  const openCharges = new Map<string, string>()
  const liveNets = (farmId: string) => state.nets.filter((n) => n.farmId === farmId && !n.archivedAt)
  const isOa = (farmId: string) => state.farms.find((f) => f.id === farmId)?.createdVia === OA_CREATED_VIA
  const newestFirst = (a: ScanRow, b: ScanRow) => (b.sampleDate ?? '').localeCompare(a.sampleDate ?? '') || b.createdAt.localeCompare(a.createdAt)
  const stockingOf = (c: MemoryCycle): CycleRow => ({ id: c.id, pondId: c.pondId, stockedOn: c.stockedOn, count: c.count, survival: c.survival })

  return {
    state,
    farms: {
      async byId(id) {
        return state.farms.find((f) => f.id === id) ?? null
      },
      async createOaFarm({ ownerId, ownerName, name, pondCodes }) {
        const user = state.lineUsers.find((u) => u.id === ownerId)
        if (user?.erased) throw new ApiError(403, 'not_allowed')
        if (user) {
          user.platformAccess = 'scan_only'
          user.signupSource ??= OA_CREATED_VIA
        } else {
          state.lineUsers.push({ id: ownerId, platformAccess: 'scan_only', signupSource: OA_CREATED_VIA, onboarded: false, erased: false })
        }
        await tick()
        const farm: FarmRow = { id: `farm-${++seq}`, name, createdBy: ownerId, createdVia: OA_CREATED_VIA, accessLevel: 'scan_only' }
        state.farms.push(farm)
        await tick()
        state.members.push({ id: `member-${++seq}`, farmId: farm.id, lineUserId: ownerId, role: 'owner', name: ownerName ?? '', pondIds: [], status: 'active' })
        await tick()
        for (const code of pondCodes) state.ponds.push({ id: `pond-${++seq}`, farmId: farm.id, code, netId: null })
        return farm
      },
      async target(farmId) {
        return state.targets[farmId] ?? DEFAULT_TARGET_PER_KG
      },
      async setTarget(farmId, targetPerKg) {
        state.targets[farmId] = targetPerKg
      },
      async oaFarmOfKey(farmKey) {
        return state.farms.find((f) => f.createdBy === farmKey && f.createdVia === OA_CREATED_VIA) ?? null
      },
    },
    members: {
      async activeFor(lineUserId) {
        // Newest first: a later membership wins, as `joined_at desc` does in the database.
        return [...state.members].reverse().find((m) => m.lineUserId === lineUserId && m.status === 'active') ?? null
      },
      async ofFarm(farmId) {
        return state.members.filter((m) => m.farmId === farmId && m.status === 'active')
      },
      async byId(farmId, id) {
        return state.members.find((m) => m.id === id && m.farmId === farmId && m.status === 'active') ?? null
      },
      async setRole(id, role) {
        const m = state.members.find((x) => x.id === id)
        if (m) m.role = role
      },
      async setPonds(id, pondIds) {
        await tick()
        const m = state.members.find((x) => x.id === id)
        if (m) m.pondIds = [...pondIds]
      },
      async remove(id) {
        const m = state.members.find((x) => x.id === id)
        if (m) Object.assign(m, { status: 'removed', pondIds: [] })
      },
      // UNIQUE (farm_owner_line_user_id, member_line_user_id): one row per farm key and person.
      async join({ farmId, farmKey, lineUserId, role, name, pondIds }) {
        await tick()
        const keyOf = (fid: string) => state.farms.find((f) => f.id === fid)?.createdBy
        const m = state.members.find((x) => x.lineUserId === lineUserId && keyOf(x.farmId) === farmKey)
        if (m) Object.assign(m, { farmId, role, status: 'active', pondIds: [...pondIds], ...(name ? { name } : {}) })
        else state.members.push({ id: `member-${++seq}`, farmId, lineUserId, role, name: name ?? '', pondIds: [...pondIds], status: 'active', joinedAt: new Date().toISOString() })
      },
    },
    ponds: {
      async ofFarm(farmId) {
        return state.ponds.filter((p) => p.farmId === farmId).sort((a, b) => a.code.localeCompare(b.code))
      },
      async setNet(pondId, netId) {
        const p = state.ponds.find((x) => x.id === pondId)
        if (p) p.netId = netId
      },
      async moveNet(farmId, from, to) {
        for (const p of state.ponds) if (p.farmId === farmId && p.netId === from) p.netId = to
      },
    },
    nets: {
      async ofFarm(farmId) {
        return liveNets(farmId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      },
      async create({ farmId, cm, createdBy, createdAt }) {
        await tick()
        // farm_nets_one_live_name: the name is the size.
        if (liveNets(farmId).some((n) => n.cm === cm)) return 'name_taken'
        const net: NetRow = { id: `net-${++seq}`, farmId, cm, createdBy, createdAt: createdAt ?? new Date().toISOString(), archivedAt: null }
        state.nets.push(net)
        return { ...net }
      },
      async setCm(farmId, netId, cm) {
        await tick()
        const net = liveNets(farmId).find((n) => n.id === netId)
        if (!net) return 'not_found'
        // The trigger fires before the unique index is checked.
        if (state.scans.some((s) => s.netId === netId)) return 'locked'
        if (liveNets(farmId).some((n) => n.id !== netId && n.cm === cm)) return 'name_taken'
        net.cm = cm
        return 'ok'
      },
      async archive(farmId, netId) {
        const net = liveNets(farmId).find((n) => n.id === netId)
        if (net) net.archivedAt = new Date().toISOString()
      },
    },
    scans: {
      async savedOfFarm(farmId, sinceDay) {
        return state.scans.filter((s) => s.farmId === farmId && s.sampleDate !== null && s.sampleDate >= sinceDay).sort(newestFirst)
      },
      async savedOfPond(pondId) {
        return state.scans.filter((s) => s.pondId === pondId && s.sampleDate !== null).sort(newestFirst)
      },
      async byId(id) {
        const s = state.scans.find((x) => x.id === id)
        return s ? { ...s } : null
      },
      async bySha(farmId, sha256) {
        const s = state.scans.find((x) => x.farmId === farmId && x.sha256 === sha256)
        return s ? { ...s } : null
      },
      async create({ farmId, pondId, lineUserId, sha256, flags }) {
        await tick()
        if (state.scans.some((s) => s.farmId === farmId && s.sha256 === sha256)) return 'duplicate'
        const row: MemoryScan = {
          id: `scan-${++seq}`, farmId, pondId, lineUserId, status: 'queued', sampleDate: null, measuredAt: null,
          createdAt: new Date().toISOString(), abw: null, perKg: null, cv: null, n: null, flags: [...flags],
          imageFileId: null, netId: null, rim: null, ...UNMEASURED, sha256,
        }
        state.scans.push(row)
        return { ...row }
      },
      async linkImage(id, imageFileId) {
        const s = state.scans.find((x) => x.id === id)
        if (s) s.imageFileId = imageFileId
      },
      async setRim(id, ring) {
        const s = state.scans.find((x) => x.id === id)
        if (s) s.rim = [...ring]
      },
      async update(id, patch) {
        await tick()
        const s = state.scans.find((x) => x.id === id)
        if (!s) return
        for (const [k, v] of Object.entries(patch)) if (v !== undefined) Object.assign(s, { [k]: Array.isArray(v) ? [...v] : v })
      },
      async unsaveDay(pondId, day, keepId) {
        for (const s of state.scans) {
          if (s.pondId === pondId && s.sampleDate === day && s.id !== keepId) Object.assign(s, { sampleDate: null, sampleDateSource: null })
        }
      },
      async remove(id) {
        state.scans = state.scans.filter((s) => s.id !== id)
      },
    },
    cycles: {
      async openOfFarm(farmId) {
        return state.cycles.filter((c) => c.farmId === farmId && c.open).map(stockingOf)
      },
      async openOf(pondId) {
        const c = state.cycles.find((x) => x.pondId === pondId && x.open)
        return c ? stockingOf(c) : null
      },
      async saveStocking({ farmId, pondId, farmKey, stocking }) {
        const c = state.cycles.find((x) => x.pondId === pondId && x.open)
        if (c) Object.assign(c, stocking)
        else state.cycles.push({ id: `cycle-${++seq}`, pondId, farmId, lineUserId: farmKey, open: true, ...stocking })
      },
    },
    photos: {
      async urls(ids) {
        return Object.fromEntries(ids.map((id) => [id, `https://photos.test/${id}`]))
      },
      async put(path, bytes, mime) {
        await tick()
        if (state.failPhotoPut) throw new Error('storage put failed')
        state.objects[path] = { mime, bytes: bytes.length, data: Buffer.from(bytes) }
      },
      async removeObject(path) {
        delete state.objects[path]
      },
      async addFile({ farmId, lineUserId, ref, mime, bytes, pondId }) {
        await tick()
        const id = `file-${++seq}`
        state.imageFiles.push({ id, farmId, lineUserId, ref, kind: 'shrimp_scan', mime, bytes, pondIds: [pondId] })
        return id
      },
      async removeFile(id) {
        state.imageFiles = state.imageFiles.filter((f) => f.id !== id)
      },
      async read(imageFileId) {
        const file = state.imageFiles.find((f) => f.id === imageFileId)
        const object = file ? state.objects[file.ref] : undefined
        return object ? { bytes: object.data, mime: object.mime } : null
      },
    },
    people: {
      async hasNongNamFootprint(lineUserId) {
        return (
          state.members.some((m) => m.lineUserId === lineUserId && !isOa(m.farmId)) ||
          state.farms.some((f) => f.createdBy === lineUserId && f.createdVia !== OA_CREATED_VIA) ||
          state.lineUsers.some((u) => u.id === lineUserId && u.onboarded)
        )
      },
      async stampScanOnly(lineUserId) {
        const user = state.lineUsers.find((u) => u.id === lineUserId)
        if (user?.erased) throw new ApiError(403, 'not_allowed')
        if (user) {
          user.platformAccess = 'scan_only'
          user.signupSource ??= OA_CREATED_VIA
        } else {
          state.lineUsers.push({ id: lineUserId, platformAccess: 'scan_only', signupSource: OA_CREATED_VIA, onboarded: false, erased: false })
        }
      },
    },
    quota: {
      async left(farmId, limit) {
        if (state.quotaDown) return null
        return Math.max(0, limit - (state.quotaUsed[farmId] ?? 0))
      },
      // sizing_consume_quota and sizing_refund_quota, one open charge per scan.
      async consume(scanId, limit) {
        await tick()
        if (state.quotaDown) throw new Error('sizing_consume_quota failed')
        const s = state.scans.find((x) => x.id === scanId)
        if (!s) throw new Error('measurement_not_found')
        const used = state.quotaUsed[s.farmId] ?? 0
        if (openCharges.has(scanId)) return Math.max(0, limit - used)
        if (used >= limit) return -1
        state.quotaUsed[s.farmId] = used + 1
        openCharges.set(scanId, s.farmId)
        return limit - used - 1
      },
      async refund(scanId) {
        const farmId = openCharges.get(scanId)
        if (!farmId) return false
        openCharges.delete(scanId)
        state.quotaUsed[farmId] = Math.max(0, (state.quotaUsed[farmId] ?? 0) - 1)
        return true
      },
    },
    growth: {
      // write_photo_growth_sample: a weighed or typed ABW of the pond-day wins; else the one photo row, in place.
      async writePhotoDay(input) {
        await tick()
        const day = state.growth.filter((g) => g.pondId === input.pondId && g.day === input.day)
        if (day.some((g) => g.source !== 'lift_net_photo')) return 'kept_other_source'
        const row = day.find((g) => g.source === 'lift_net_photo')
        const { cycleId, ageDays, abw, lo, hi, n, perKg } = input
        if (row) Object.assign(row, { cycleId, ageDays, abw, lo, hi, n, perKg })
        else state.growth.push({ ...input, source: 'lift_net_photo' })
        return 'written'
      },
    },
    invites: {
      async pendingOf(farmKey) {
        return state.invites.filter((i) => i.farmKey === farmKey && i.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      },
      async create({ farmKey, createdBy, code, token, role, pondIds, expiresAt }) {
        await tick()
        if (state.invites.some((i) => i.code === code)) return 'code_taken'
        const row: MemoryInvite = {
          id: `invite-${++seq}`, farmKey, code, token, role, pondIds: [...pondIds], status: 'pending',
          expiresAt, createdAt: new Date().toISOString(), createdBy,
        }
        state.invites.push(row)
        return { ...row }
      },
      async byCode(code) {
        const i = state.invites.find((x) => x.code === code)
        return i ? { ...i } : null
      },
      async cancel(farmKey, code) {
        const i = state.invites.find((x) => x.farmKey === farmKey && x.code === code && x.status === 'pending')
        if (i) i.status = 'cancelled'
        return Boolean(i)
      },
      async claim(id, lineUserId) {
        await tick()
        const i = state.invites.find((x) => x.id === id && x.status === 'pending')
        if (!i) return false
        Object.assign(i, { status: 'claimed', claimedBy: lineUserId })
        return true
      },
      async unclaim(id) {
        const i = state.invites.find((x) => x.id === id && x.status === 'claimed')
        if (i) Object.assign(i, { status: 'pending', claimedBy: null })
      },
    },
    settings: {
      async read(farmId) {
        return settingsFromJson(state.settings[farmId])
      },
      async write(farmId, settings) {
        await tick()
        state.settings[farmId] = settingsToJson(settings)
      },
    },
  }
}
