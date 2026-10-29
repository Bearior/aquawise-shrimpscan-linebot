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
import { ApiError } from './context.js'
import { OA_CREATED_VIA, type CycleRow, type FarmRow, type MemberRow, type NetRow, type PondRow, type Repos, type ScanRow } from './types.js'

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

/** A `sizing_measurements` row as the memory store keeps it. */
export interface MemoryScan extends ScanRow {
  sha256?: string
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

export interface MemoryState {
  farms: FarmRow[]
  members: MemberRow[]
  ponds: PondRow[]
  nets: NetRow[]
  scans: MemoryScan[]
  /** Storage objects by path. */
  objects: Record<string, { mime: string; bytes: number }>
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
}

export type MemoryRepos = Repos & { state: MemoryState }

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

export function createMemoryRepos(seed: Partial<MemoryState> = {}): MemoryRepos {
  const state: MemoryState = {
    farms: [...(seed.farms ?? [])],
    members: [...(seed.members ?? [])],
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
  }
  let seq = 0
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
    },
    members: {
      async activeFor(lineUserId) {
        // Newest first: a later membership wins, as `joined_at desc` does in the database.
        return [...state.members].reverse().find((m) => m.lineUserId === lineUserId && m.status === 'active') ?? null
      },
      async ofFarm(farmId) {
        return state.members.filter((m) => m.farmId === farmId && m.status === 'active')
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
          imageFileId: null, netId: null, rim: null, sha256,
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
        state.objects[path] = { mime, bytes: bytes.length }
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
    },
    people: {
      async hasNongNamFootprint(lineUserId) {
        return (
          state.members.some((m) => m.lineUserId === lineUserId && !isOa(m.farmId)) ||
          state.farms.some((f) => f.createdBy === lineUserId && f.createdVia !== OA_CREATED_VIA) ||
          state.lineUsers.some((u) => u.id === lineUserId && u.onboarded)
        )
      },
    },
    quota: {
      async left(farmId, limit) {
        if (state.quotaDown) return null
        return Math.max(0, limit - (state.quotaUsed[farmId] ?? 0))
      },
    },
  }
}
