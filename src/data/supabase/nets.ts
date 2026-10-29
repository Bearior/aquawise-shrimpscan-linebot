import type { SupabaseClient } from '@supabase/supabase-js'
import { netName } from '../../domain/nets.js'
import type { NetRow, NetsRepo } from '../types.js'
import { dbFail, isUniqueViolation } from './errors.js'
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
        .order('id', { ascending: true })
      if (error) throw dbFail('farm_nets.ofFarm', error)
      return ((data as NetDbRow[] | null) ?? []).map(toNet)
    },
    async create({ farmId, farmKey, cm, createdBy, createdAt }) {
      const { data, error } = await db
        .from('farm_nets')
        .insert({
          farm_id: farmId,
          farm_key: farmKey,
          name: netName(cm),
          diameter_cm: cm,
          created_by: createdBy,
          ...(createdAt ? { created_at: createdAt } : {}),
        })
        .select(NET_COLS)
        .single()
      if (error) {
        if (isUniqueViolation(error)) return 'name_taken'
        throw dbFail('farm_nets insert', error)
      }
      return toNet(data as NetDbRow)
    },
    async setCm(farmId, netId, cm) {
      const { data, error } = await db
        .from('farm_nets')
        .update({ diameter_cm: cm, name: netName(cm) })
        .eq('farm_id', farmId)
        .eq('id', netId)
        .is('archived_at', null)
        .select('id')
      if (error) {
        // farm_nets_diameter_locked: a photo was measured with this ยอ.
        if (/net_diameter_locked/.test(error.message)) return 'locked'
        if (isUniqueViolation(error)) return 'name_taken'
        throw dbFail('farm_nets setCm', error)
      }
      return (data ?? []).length ? 'ok' : 'not_found'
    },
    async archive(farmId, netId) {
      const { error } = await db
        .from('farm_nets')
        .update({ archived_at: new Date().toISOString() })
        .eq('farm_id', farmId)
        .eq('id', netId)
        .is('archived_at', null)
      if (error) throw dbFail('farm_nets archive', error)
    },
  }
}
