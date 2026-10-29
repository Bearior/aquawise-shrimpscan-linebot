/**
 * Who is asking, in which farm, and the write guard.
 *
 * THE GUARD (Bear, 2026-10-29): while the staging OA reads the PROD database,
 * it touches only farms it created itself (`created_via = 'shrimp_scan_oa'`).
 * A person whose farm came from anywhere else (น้องน้ำ onboarding, an import,
 * the web scan) gets 403 `use_nong_nam` on every farm route, and nothing is
 * written for them.
 */

import { OA_CREATED_VIA, type FarmRow, type MemberRow, type Repos } from './types.js'

/** An answer a route sends as `{ error: code }` with this status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
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
  if (!me) return { lineUserId, farm: null, me: null, blocked: false }
  const farm = await repos.farms.byId(me.farmId)
  if (!farm) return { lineUserId, farm: null, me: null, blocked: false }
  return { lineUserId, farm, me, blocked: farm.createdVia !== OA_CREATED_VIA }
}

/** The farm and the person in it, or the answer that stops the route. */
export function requireFarm(ctx: Ctx): { farm: FarmRow; me: MemberRow } {
  if (ctx.blocked) throw new ApiError(403, 'use_nong_nam')
  if (!ctx.farm || !ctx.me) throw new ApiError(409, 'no_farm')
  return { farm: ctx.farm, me: ctx.me }
}
