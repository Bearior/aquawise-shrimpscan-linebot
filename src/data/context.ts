/**
 * Who is asking, in which farm, and the write guard.
 *
 * THE GUARD (Bear, 2026-10-29): while the staging OA reads the PROD database,
 * it touches only farms it created itself (`created_via = 'shrimp_scan_oa'`).
 * A person whose farm came from anywhere else (น้องน้ำ onboarding, an import,
 * the web scan) gets 403 `use_nong_nam` on every farm route, and nothing is
 * written for them. With no active OA membership, any footing in น้องน้ำ
 * blocks too (a left membership, a farm they made, a finished onboarding):
 * the scan_only stamp a new OA farm brings would lock their น้องน้ำ LIFF.
 */

import { OA_CREATED_VIA, type FarmRow, type MemberRow, type Repos } from './types.js'

/** An answer a route sends as `{ error: code }` with this status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** Sent beside the code: why a measure failed ('no_rim', 'timeout'). */
    readonly reason?: string,
  ) {
    super(code)
    this.name = 'ApiError'
  }
}

export interface Ctx {
  lineUserId: string
  farm: FarmRow | null
  me: MemberRow | null
  /** The person's farm exists but was not made by this OA. */
  blocked: boolean
}

export async function resolveContext(repos: Repos, lineUserId: string): Promise<Ctx> {
  const me = await repos.members.activeFor(lineUserId)
  const farm = me ? await repos.farms.byId(me.farmId) : null
  if (me && farm) return { lineUserId, farm, me, blocked: farm.createdVia !== OA_CREATED_VIA }
  return { lineUserId, farm: null, me: null, blocked: await repos.people.hasNongNamFootprint(lineUserId) }
}

/** The farm and the person in it, or the answer that stops the route. */
export function requireFarm(ctx: Ctx): { farm: FarmRow; me: MemberRow } {
  if (ctx.blocked) throw new ApiError(403, 'use_nong_nam')
  if (!ctx.farm || !ctx.me) throw new ApiError(409, 'no_farm')
  return { farm: ctx.farm, me: ctx.me }
}
