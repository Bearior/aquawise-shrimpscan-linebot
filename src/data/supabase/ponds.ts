import type { SupabaseClient } from '@supabase/supabase-js'
import type { PondRow, PondsRepo } from '../types.js'
import { dbFail } from './errors.js'

interface Row {
  id: string
  farm_id: string
  name: string
  net_id: string | null
}

export function supabasePonds(db: SupabaseClient): PondsRepo {
  return {
    async ofFarm(farmId) {
      const { data, error } = await db
        .from('ponds')
        .select('id, farm_id, name, net_id')
        .eq('farm_id', farmId)
        .is('archived_at', null)
        .order('name', { ascending: true })
      if (error) throw dbFail('ponds.ofFarm', error)
      return ((data as Row[] | null) ?? []).map((r): PondRow => ({ id: r.id, farmId: r.farm_id, code: r.name, netId: r.net_id }))
    },
  }
}
