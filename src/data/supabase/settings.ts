import type { SupabaseClient } from '@supabase/supabase-js'
import { settingsFromJson, settingsToJson } from '../../domain/settings.js'
import type { SettingsRepo } from '../types.js'
import { dbFail } from './errors.js'

export function supabaseSettings(db: SupabaseClient): SettingsRepo {
  return {
    async read(farmId) {
      const { data, error } = await db.from('shrimp_scan_farm_settings').select('notify').eq('farm_id', farmId).maybeSingle()
      if (error) throw dbFail('shrimp_scan_farm_settings notify read', error)
      return settingsFromJson((data as { notify: unknown } | null)?.notify)
    },

    async write(farmId, settings) {
      // merge-duplicates updates only the columns given, so target_per_kg is kept.
      const { error } = await db
        .from('shrimp_scan_farm_settings')
        .upsert({ farm_id: farmId, notify: settingsToJson(settings), updated_at: new Date().toISOString() }, { onConflict: 'farm_id' })
      if (error) throw dbFail('shrimp_scan_farm_settings notify upsert', error)
    },
  }
}
