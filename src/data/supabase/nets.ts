import type { SupabaseClient } from '@supabase/supabase-js'
import type { NetRow, NetsRepo } from '../types.js'
import { dbFail } from './errors.js'
import { num } from './num.js'

export const NET_COLS = 'id, farm_id, diameter_cm, created_by, created_at, archived_at'

export interface NetDbRow {
  id: string
  farm_id: string
  diameter_cm: number | string
  created_by: string | null
  created_at: string
  archived_at: string | null
}

export function toNet(r: NetDbRow): NetRow {
  return { id: r.id, farmId: r.farm_id, cm: num(r.diameter_cm) ?? 0, createdBy: r.created_by, createdAt: r.created_at, archivedAt: r.archived_at }
}

export function supabaseNets(db: SupabaseClient): NetsRepo {
  return {
    async ofFarm(farmId) {
      const { data, error } = await db
        .from('farm_nets')
        .select(NET_COLS)
        .eq('farm_id', farmId)
        .is('archived_at', null)
        .order('created_at', { ascending: true })
      if (error) throw dbFail('farm_nets.ofFarm', error)
      return ((data as NetDbRow[] | null) ?? []).map(toNet)
    },
  }
}
