import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScanRow, ScansRepo } from '../types.js'
import { dbFail, isUniqueViolation } from './errors.js'
import { num } from './num.js'

export const SCAN_COLS =
  'id, farm_id, pond_id, line_user_id, status, sample_date, measured_at, created_at, abw_g, shrimp_per_kg, cv, n, flags, image_file_id, net_id, rim_ellipse'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  net_id: string | null
  rim_ellipse: number[] | null
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
    netId: r.net_id,
    rim: r.rim_ellipse,
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
    async byId(id) {
      // A path id that is not a uuid would be a Postgres cast error, not a miss.
      if (!UUID.test(id)) return null
      const { data, error } = await db.from('sizing_measurements').select(SCAN_COLS).eq('id', id).maybeSingle()
      if (error) throw dbFail('sizing_measurements.byId', error)
      return data ? toScan(data as ScanDbRow) : null
    },
    async bySha(farmId, sha256) {
      const { data, error } = await db.from('sizing_measurements').select(SCAN_COLS).eq('farm_id', farmId).eq('photo_sha256', sha256).maybeSingle()
      if (error) throw dbFail('sizing_measurements.bySha', error)
      return data ? toScan(data as ScanDbRow) : null
    },
    async create({ farmId, pondId, lineUserId, sha256, flags }) {
      const { data, error } = await db
        .from('sizing_measurements')
        .insert({ farm_id: farmId, pond_id: pondId, line_user_id: lineUserId, photo_sha256: sha256, status: 'queued', flags })
        .select(SCAN_COLS)
        .single()
      if (error) {
        if (isUniqueViolation(error)) return 'duplicate'
        throw dbFail('sizing_measurements insert', error)
      }
      return toScan(data as ScanDbRow)
    },
    async linkImage(id, imageFileId) {
      const { error } = await db.from('sizing_measurements').update({ image_file_id: imageFileId }).eq('id', id)
      if (error) throw dbFail('sizing_measurements linkImage', error)
    },
    async setRim(id, ring) {
      const { error } = await db.from('sizing_measurements').update({ rim_ellipse: ring }).eq('id', id)
      if (error) throw dbFail('sizing_measurements setRim', error)
    },
    async remove(id) {
      const { error } = await db.from('sizing_measurements').delete().eq('id', id)
      if (error) throw dbFail('sizing_measurements delete', error)
    },
  }
}
