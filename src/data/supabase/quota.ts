import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../../lib/logger.js'
import type { QuotaRepo } from '../types.js'
import { dbFail } from './errors.js'

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
    async consume(scanId, limit) {
      const { data, error } = await db.rpc('sizing_consume_quota', { p_measurement_id: scanId, p_limit: limit })
      if (error) throw dbFail('sizing_consume_quota', error)
      return typeof data === 'number' && Number.isInteger(data) ? data : null
    },
    async refund(scanId) {
      const { data, error } = await db.rpc('sizing_refund_quota', { p_measurement_id: scanId })
      if (error) throw dbFail('sizing_refund_quota', error)
      return data === true
    },
  }
}
