/**
 * Rows as the routes see them, and the repositories that read and write them.
 *
 * Two implementations: `supabase/` (the shared database) and `memory.ts` (every
 * route test). Routes only ever see `Repos`.
 */

import type { Role, Stocking } from '../contract/types.js'

/** The mark a farm made by this OA carries (migration 211). */
export const OA_CREATED_VIA = 'shrimp_scan_oa'

export interface FarmRow {
  id: string
  name: string
  /** The farm key: the owner's LINE user id. */
  createdBy: string
  createdVia: string | null
  accessLevel: string
}

export type MemberStatus = 'active' | 'invited' | 'left' | 'removed' | 'declined'

export interface MemberRow {
  id: string
  farmId: string
  lineUserId: string
  role: Role
  /** '' when the row has no display name. */
  name: string
  /** The ponds this person looks after (an owner looks after every pond). */
  pondIds: string[]
  status: MemberStatus
}

export interface PondRow {
  id: string
  farmId: string
  /** The pond's name in `ponds.name`: 'A01'. */
  code: string
  netId: string | null
}

/** A ยอ (`farm_nets`). The farm's default is its oldest live one. */
export interface NetRow {
  id: string
  farmId: string
  /** `diameter_cm`: the ยอ is round. */
  cm: number
  createdBy: string | null
  createdAt: string
  archivedAt: string | null
}

/** A scan (`sizing_measurements`), as far as the pond pages read it. */
export interface ScanRow {
  id: string
  farmId: string
  pondId: string
  /** Who sent the photo (and measured it). */
  lineUserId: string
  status: string
  /** The day it was saved into the pond; null until it is. */
  sampleDate: string | null
  measuredAt: string | null
  createdAt: string
  abw: number | null
  perKg: number | null
  cv: number | null
  n: number | null
  /** `remeasure`, `note:<text>`, `fixed:<userTag>:<oldPerKg>`. */
  flags: string[]
  imageFileId: string | null
  /** The ยอ the photo was measured with. */
  netId: string | null
}

/** A pond's open cycle (state setup, preparing or active). */
export interface CycleRow extends Stocking {
  id: string
  pondId: string
}

export interface CreateOaFarmInput {
  ownerId: string
  /** The owner's LINE display name, when the token carried one. */
  ownerName: string | null
  name: string
  pondCodes: string[]
}

export interface FarmsRepo {
  byId(id: string): Promise<FarmRow | null>
  /**
   * The farm, its owner's self-membership and its ponds, with the owner's
   * `line_users` row stamped scan_only first. Throws `ApiError(403,
   * 'not_allowed')` for an erased account, with nothing written.
   */
  createOaFarm(input: CreateOaFarmInput): Promise<FarmRow>
  /** จับขายที่ไซส์ (ตัว/กก.); the default when the farm never set one. */
  target(farmId: string): Promise<number>
  setTarget(farmId: string, targetPerKg: number): Promise<void>
}

export interface MembersRepo {
  /** The person's active membership, newest first; null when there is none. */
  activeFor(lineUserId: string): Promise<MemberRow | null>
  /** Everyone active in the farm, oldest first. */
  ofFarm(farmId: string): Promise<MemberRow[]>
}

export interface PondsRepo {
  /** The farm's live ponds, by code. */
  ofFarm(farmId: string): Promise<PondRow[]>
  /** The pond's own ยอ (`net_id`, `net_id_source 'assigned'`). */
  setNet(pondId: string, netId: string): Promise<void>
  /** Every pond of the farm on ยอ `from` moves to ยอ `to` (a ยอ replaced by a corrected one). */
  moveNet(farmId: string, from: string, to: string): Promise<void>
}

export interface NetCreateInput {
  farmId: string
  /** `farm_key`: the farm owner's LINE id. */
  farmKey: string
  cm: number
  createdBy: string
  /** Kept from the ยอ this one replaces, so a replaced farm ยอ stays the oldest. */
  createdAt?: string
}

export interface NetsRepo {
  /** The farm's live ยอ, oldest first (the first is the farm's default). */
  ofFarm(farmId: string): Promise<NetRow[]>
  /** `name_taken`: the farm already has a live ยอ of that size (`farm_nets_one_live_name`). */
  create(input: NetCreateInput): Promise<NetRow | 'name_taken'>
  /**
   * Corrects the size in place. `locked`: a photo was measured with this ยอ
   * (trigger `farm_nets_diameter_locked`), so its size is history.
   */
  setCm(farmId: string, netId: string, cm: number): Promise<'ok' | 'locked' | 'name_taken' | 'not_found'>
  archive(farmId: string, netId: string): Promise<void>
}

export interface ScansRepo {
  /** Saved scans of the farm on or after `sinceDay`, newest first. */
  savedOfFarm(farmId: string, sinceDay: string): Promise<ScanRow[]>
  /** Every saved scan of the pond, newest first. */
  savedOfPond(pondId: string): Promise<ScanRow[]>
}

export interface CyclesRepo {
  /** The open cycle of each pond of the farm that has one. */
  openOfFarm(farmId: string): Promise<CycleRow[]>
  openOf(pondId: string): Promise<CycleRow | null>
  /** Writes the open cycle's stocking, opening one (state 'active') when there is none. */
  saveStocking(input: { farmId: string; pondId: string; farmKey: string; stocking: Stocking }): Promise<void>
}

export interface PhotosRepo {
  /** Signed URLs (1 hour) by `record_image_files.id`; an id that cannot be signed is left out. */
  urls(imageFileIds: string[]): Promise<Record<string, string>>
}

export interface PeopleRepo {
  /**
   * The person already has a footing in น้องน้ำ: a membership on either side
   * (any status) in a farm this OA did not make, a farm they made elsewhere
   * (any status), or a finished น้องน้ำ onboarding. Such a person is never
   * stamped scan_only: that stamp locks the น้องน้ำ LIFF.
   */
  hasNongNamFootprint(lineUserId: string): Promise<boolean>
}

export interface QuotaRepo {
  /** Scans the farm can still pay for today; null when it cannot be read. */
  left(farmId: string, limit: number): Promise<number | null>
}

export interface Repos {
  farms: FarmsRepo
  members: MembersRepo
  ponds: PondsRepo
  people: PeopleRepo
  quota: QuotaRepo
  nets: NetsRepo
  scans: ScansRepo
  cycles: CyclesRepo
  photos: PhotosRepo
}
