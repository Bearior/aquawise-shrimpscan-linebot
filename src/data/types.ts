/**
 * Rows as the routes see them, and the repositories that read and write them.
 *
 * Two implementations: `supabase/` (the shared database) and `memory.ts` (every
 * route test). Routes only ever see `Repos`.
 */

import type { Role } from '../contract/types.js'

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
}
