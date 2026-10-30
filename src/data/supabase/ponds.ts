import type { SupabaseClient } from '@supabase/supabase-js'
import type { PondRow, PondsRepo } from '../types.js'
import { dbFail } from './errors.js'

interface Row {
  id: string
  farm_id: string
  name: string
  net_id: string | null
}

const COLS = 'id, farm_id, name, net_id'
const toPond = (r: Row): PondRow => ({ id: r.id, farmId: r.farm_id, code: r.name, netId: r.net_id })
/** ponds_live_name_unique (migration 206): one live name per farm, any case. */
const UNIQUE_VIOLATION = '23505'

export function supabasePonds(db: SupabaseClient): PondsRepo {
  return {
    async ofFarm(farmId) {
      const { data, error } = await db
        .from('ponds')
        .select(COLS)
        .eq('farm_id', farmId)
        .is('archived_at', null)
        .order('name', { ascending: true })
      if (error) throw dbFail('ponds.ofFarm', error)
      return ((data as Row[] | null) ?? []).map(toPond)
    },
    async create({ farmId, farmKey, codes }) {
      // The same row a new farm's ponds get (farms.ts createOaFarm).
      const { data, error } = await db
        .from('ponds')
        .insert(codes.map((code) => ({ farm_id: farmId, user_id: farmKey, name: code, status: 'active' })))
        .select(COLS)
      if (error?.code === UNIQUE_VIOLATION) return 'name_taken'
      if (error) throw dbFail('ponds.create', error)
      return ((data as Row[] | null) ?? []).map(toPond)
    },
    async rename(pondId, code) {
      const { error } = await db.from('ponds').update({ name: code }).eq('id', pondId)
      if (error?.code === UNIQUE_VIOLATION) return 'name_taken'
      if (error) throw dbFail('ponds.rename', error)
      return 'ok'
    },
    async setNet(pondId, netId) {
      const { error } = await db.from('ponds').update({ net_id: netId, net_id_source: 'assigned' }).eq('id', pondId)
      if (error) throw dbFail('ponds.setNet', error)
    },
    async moveNet(farmId, from, to) {
      const { error } = await db.from('ponds').update({ net_id: to }).eq('farm_id', farmId).eq('net_id', from)
      if (error) throw dbFail('ponds.moveNet', error)
    },
  }
}
