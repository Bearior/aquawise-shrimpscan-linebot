/**
 * The guard's footprint check, read straight from the facts like line-bot's
 * `classifyScanUser` (src/lib/farms/resolve-scan-farm.ts, rules 2 to 4), each
 * read checked: a read error throws (500) and nothing is written.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { OA_CREATED_VIA, type PeopleRepo } from '../types.js'
import { dbFail } from './errors.js'
import { stampScanOnly } from './farms.js'

export function supabasePeople(db: SupabaseClient): PeopleRepo {
  return {
    async hasNongNamFootprint(lineUserId) {
      // Any membership, either side of it, any status.
      const farmIds = new Set<string>()
      for (const column of ['member_line_user_id', 'farm_owner_line_user_id'] as const) {
        const { data, error } = await db.from('farm_members').select('farm_id').eq(column, lineUserId)
        if (error) throw dbFail(`farm_members ${column}`, error)
        for (const r of (data as { farm_id: string | null }[] | null) ?? []) {
          if (!r.farm_id) return true
          farmIds.add(r.farm_id)
        }
      }
      if (farmIds.size > 0) {
        const { data, error } = await db.from('farms').select('id, created_via').in('id', [...farmIds])
        if (error) throw dbFail('farms of memberships', error)
        if (((data as { created_via: string | null }[] | null) ?? []).some((f) => f.created_via !== OA_CREATED_VIA)) return true
      }

      // Any farm they made outside this OA, archived included.
      const own = await db.from('farms').select('id, created_via').eq('created_by', lineUserId)
      if (own.error) throw dbFail('farms created_by', own.error)
      if (((own.data as { created_via: string | null }[] | null) ?? []).some((f) => f.created_via !== OA_CREATED_VIA)) return true

      // Onboarded, even without a farm row.
      const u = await db.from('line_users').select('onboarding_complete').eq('id', lineUserId).maybeSingle()
      if (u.error) throw dbFail('line_users onboarding', u.error)
      return (u.data as { onboarding_complete?: boolean } | null)?.onboarding_complete === true
    },

    stampScanOnly: (lineUserId, name) => stampScanOnly(db, lineUserId, name),

    async setPicture(lineUserId, pictureUrl) {
      const { error } = await db.from('line_users').update({ picture_url: pictureUrl }).eq('id', lineUserId)
      if (error) throw dbFail('line_users picture_url', error)
    },

    async pictures(lineUserIds) {
      const out = new Map<string, string>()
      if (!lineUserIds.length) return out
      const { data, error } = await db.from('line_users').select('id, picture_url').in('id', lineUserIds)
      if (error) throw dbFail('line_users pictures', error)
      for (const r of (data as { id: string; picture_url: string | null }[] | null) ?? []) if (r.picture_url) out.set(r.id, r.picture_url)
      return out
    },
  }
}
