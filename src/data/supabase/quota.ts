import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../../lib/logger.js'
import type { QuotaRepo } from '../types.js'

export function supabaseQuota(db: SupabaseClient): QuotaRepo {
  return {
    async left(farmId, limit) {
      // sizing_quota_status returns one (day, used, remaining) row.
      const { data, error } = await db.rpc('sizing_quota_status', { p_farm_id: farmId, p_limit: limit })
      if (error) {
        logger.warn('[db] sizing_quota_status failed', { error: error.message })
        return null
      }
      const row = (Array.isArray(data) ? data[0] : data) as { remaining?: number } | null | undefined
      return typeof row?.remaining === 'number' ? row.remaining : null
    },
  }
}
