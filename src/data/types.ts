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
  name: string
  /** The ponds this person looks after (an owner looks after every pond). */
  pondIds: string[]
  status: MemberStatus
}

export interface FarmsRepo {
  byId(id: string): Promise<FarmRow | null>
}

export interface MembersRepo {
  /** The person's active membership, newest first; null when there is none. */
  activeFor(lineUserId: string): Promise<MemberRow | null>
}

export interface Repos {
  farms: FarmsRepo
  members: MembersRepo
}
