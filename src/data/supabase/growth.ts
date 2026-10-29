import type { SupabaseClient } from '@supabase/supabase-js'
import type { GrowthRepo } from '../types.js'
import { dbFail } from './errors.js'

export function supabaseGrowth(db: SupabaseClient): GrowthRepo {
  return {
    async writePhotoDay({ farmKey, pondId, day, cycleId, ageDays, abw, lo, hi, n, perKg }) {
      const { data, error } = await db.rpc('write_photo_growth_sample', {
        p_farm_key: farmKey,
        p_pond_id: pondId,
        p_date: day,
        p_cycle_id: cycleId,
        p_age: ageDays,
        p_abw: abw,
        p_lo: lo,
        p_hi: hi,
        p_n: n,
        p_per_kg: perKg,
      })
      if (error) throw dbFail('write_photo_growth_sample', error)
      return String(data)
    },
  }
}
