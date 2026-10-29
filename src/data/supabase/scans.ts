import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScanRow, ScansRepo } from '../types.js'
import { dbFail } from './errors.js'
import { num } from './num.js'

export const SCAN_COLS =
  'id, farm_id, pond_id, line_user_id, status, sample_date, measured_at, created_at, abw_g, shrimp_per_kg, cv, n, flags, image_file_id'

/** A pond's history is a cycle or two long; this bounds one read. */
const POND_SCANS_MAX = 400

export interface ScanDbRow {
  id: string
  farm_id: string
  pond_id: string | null
  line_user_id: string | null
  status: string
  sample_date: string | null
  measured_at: string | null
  created_at: string
  abw_g: number | string | null
  shrimp_per_kg: number | string | null
  cv: number | string | null
  n: number | null
  flags: string[] | null
  image_file_id: string | null
}

export function toScan(r: ScanDbRow): ScanRow {
  return {
    id: r.id,
    farmId: r.farm_id,
    pondId: r.pond_id ?? '',
    lineUserId: r.line_user_id ?? '',
    status: r.status,
    sampleDate: r.sample_date,
    measuredAt: r.measured_at,
    createdAt: r.created_at,
    abw: num(r.abw_g),
    perKg: num(r.shrimp_per_kg),
    cv: num(r.cv),
    n: r.n,
    flags: r.flags ?? [],
    imageFileId: r.image_file_id,
  }
}

export function supabaseScans(db: SupabaseClient): ScansRepo {
  return {
    async savedOfFarm(farmId, sinceDay) {
      const { data, error } = await db
        .from('sizing_measurements')
        .select(SCAN_COLS)
        .eq('farm_id', farmId)
        .gte('sample_date', sinceDay)
        .order('sample_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw dbFail('sizing_measurements.savedOfFarm', error)
      return ((data as ScanDbRow[] | null) ?? []).map(toScan)
    },
    async savedOfPond(pondId) {
      const { data, error } = await db
        .from('sizing_measurements')
        .select(SCAN_COLS)
        .eq('pond_id', pondId)
        .not('sample_date', 'is', null)
        .order('sample_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(POND_SCANS_MAX)
      if (error) throw dbFail('sizing_measurements.savedOfPond', error)
      return ((data as ScanDbRow[] | null) ?? []).map(toScan)
    },
  }
}
