/**
 * The farm writer for this OA. It mirrors line-bot's one farm writer
 * (src/lib/farms/create-farm.ts): the farm row with a farm_code retried on
 * collision, then the owner's self-membership upserted on the farm key, and
 * the farm deleted again by hand when a later write fails (there is no
 * transaction across PostgREST calls), so no farm is left that nobody
 * belongs to. Before any of that, the owner's `line_users` row: farms.created_by
 * references it, and the scan_only stamp goes first like the web scan's (a
 * stamp without a farm is retried next time; a farm without the stamp would
 * read as a platform farm).
 *
 * Service-role only. The guard (src/data/context.ts) has already refused a
 * person with any footing in น้องน้ำ before this runs.
 */

import { randomInt } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_TARGET_PER_KG } from '../../domain/farm.js'
import { logger } from '../../lib/logger.js'
import { ApiError } from '../context.js'
import { OA_CREATED_VIA, type FarmRow, type FarmsRepo } from '../types.js'
import { dbFail, isUniqueViolation } from './errors.js'

const FARM_COLS = 'id, name, created_by, created_via, access_level'
const FARM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** AW-XXXXXX: six characters, no ambiguous ones, cryptographically random. */
export function generateFarmCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) code += FARM_CODE_ALPHABET[randomInt(FARM_CODE_ALPHABET.length)]
  return 'AW-' + code
}

interface Row {
  id: string
  name: string | null
  created_by: string
  created_via: string | null
  access_level: string
}

function toFarm(r: Row): FarmRow {
  return { id: r.id, name: r.name ?? '', createdBy: r.created_by, createdVia: r.created_via, accessLevel: r.access_level }
}

/** The owner's line_users row: made when missing, stamped scan_only either way. */
async function stampOwner(db: SupabaseClient, ownerId: string, ownerName: string | null): Promise<void> {
  const found = await db.from('line_users').select('id, dsr_erased_at').eq('id', ownerId).maybeSingle()
  if (found.error) throw dbFail('line_users read', found.error)
  const row = found.data as { id: string; dsr_erased_at: string | null } | null
  if (row?.dsr_erased_at) throw new ApiError(403, 'not_allowed')
  if (!row) {
    const ins = await db
      .from('line_users')
      .insert({ id: ownerId, display_name: ownerName, platform_access: 'scan_only', signup_source: OA_CREATED_VIA })
    if (!ins.error) return
    // น้องน้ำ made the row in between (a follow): stamp it like any other.
    if (!isUniqueViolation(ins.error)) throw dbFail('line_users insert', ins.error)
  }
  // `.select` so an UPDATE that matched no row (erased in between) is caught.
  const marked = await db
    .from('line_users')
    .update({ platform_access: 'scan_only' })
    .eq('id', ownerId)
    .is('dsr_erased_at', null)
    .select('id')
  if (marked.error) throw dbFail('line_users stamp', marked.error)
  if (!((marked.data as unknown[] | null) ?? []).length) throw new ApiError(403, 'not_allowed')
  const source = await db.from('line_users').update({ signup_source: OA_CREATED_VIA }).eq('id', ownerId).is('signup_source', null)
  if (source.error) throw dbFail('line_users signup_source', source.error)
}

async function undoFarm(db: SupabaseClient, farmId: string): Promise<void> {
  // ponds and farm_members go with it (ON DELETE CASCADE).
  const { error } = await db.from('farms').delete().eq('id', farmId)
  if (error) logger.error('[db] createOaFarm could not roll back a farm', { farmId, error: error.message })
}

export function supabaseFarms(db: SupabaseClient): FarmsRepo {
  return {
    async byId(id) {
      const { data, error } = await db.from('farms').select(FARM_COLS).eq('id', id).maybeSingle()
      if (error) throw dbFail('farms.byId', error)
      return data ? toFarm(data as Row) : null
    },

    async createOaFarm({ ownerId, ownerName, name, pondCodes }) {
      await stampOwner(db, ownerId, ownerName)

      // farm_code is UNIQUE: retry a collision, never anything else.
      let farm: FarmRow | null = null
      let lastErr: { message?: string; code?: string } | null = null
      for (let attempt = 0; attempt < 3 && !farm; attempt++) {
        const { data, error } = await db
          .from('farms')
          .insert({
            name,
            farm_code: generateFarmCode(),
            status: 'active',
            access_level: 'scan_only',
            created_via: OA_CREATED_VIA,
            created_by: ownerId,
          })
          .select(FARM_COLS)
          .single()
        if (!error && data) {
          farm = toFarm(data as Row)
          break
        }
        lastErr = error
        if (isUniqueViolation(error) && /farm_code/.test(String(error?.message ?? ''))) continue
        break
      }
      if (!farm) throw dbFail('farms insert', lastErr)

      // UPSERT on the farm key, error CHECKED (line-bot 074/076): a failure
      // must not leave a farm nobody belongs to.
      const member = await db.from('farm_members').upsert(
        {
          farm_owner_line_user_id: ownerId,
          member_line_user_id: ownerId,
          role: 'owner',
          status: 'active',
          scope: 'all',
          display_name: ownerName,
          farm_id: farm.id,
        },
        { onConflict: 'farm_owner_line_user_id,member_line_user_id' },
      )
      if (member.error) {
        await undoFarm(db, farm.id)
        throw dbFail('farm_members upsert', member.error)
      }

      const ponds = await db
        .from('ponds')
        .insert(pondCodes.map((code) => ({ farm_id: farm.id, user_id: ownerId, name: code, status: 'active' })))
      if (ponds.error) {
        await undoFarm(db, farm.id)
        throw dbFail('ponds insert', ponds.error)
      }

      // The น้องน้ำ pointer, so the LIFF there resolves this same farm the day
      // staff grant it. Not fatal: the membership row is read first.
      const link = await db.from('line_users').update({ farm_id: farm.id }).eq('id', ownerId)
      if (link.error) logger.warn('[db] createOaFarm could not link line_users.farm_id', { farmId: farm.id, error: link.error.message })

      return farm
    },

    async target(farmId) {
      const { data, error } = await db.from('shrimp_scan_farm_settings').select('target_per_kg').eq('farm_id', farmId).maybeSingle()
      if (error) throw dbFail('shrimp_scan_farm_settings read', error)
      return (data as { target_per_kg: number | null } | null)?.target_per_kg ?? DEFAULT_TARGET_PER_KG
    },

    async setTarget(farmId, targetPerKg) {
      // merge-duplicates updates only these columns, so notify is kept.
      const { error } = await db
        .from('shrimp_scan_farm_settings')
        .upsert({ farm_id: farmId, target_per_kg: targetPerKg, updated_at: new Date().toISOString() }, { onConflict: 'farm_id' })
      if (error) throw dbFail('shrimp_scan_farm_settings upsert', error)
    },
  }
}
