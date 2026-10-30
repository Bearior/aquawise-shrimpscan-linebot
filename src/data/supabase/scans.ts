import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../../lib/logger.js'
import type { ScanPatch, ScanRow, ScansRepo } from '../types.js'
import { dbFail, isUniqueViolation, type PgError } from './errors.js'
import { num } from './num.js'

/** สแกนวันนี้'s grid: rows a page, and a ceiling so a runaway farm cannot loop. */
const SCAN_DAYS_PAGE = 1000
const SCAN_DAYS_MAX = 20000

const BASE_COLS =
  'id, farm_id, pond_id, line_user_id, status, sample_date, measured_at, created_at, abw_g, abw_lo_g, abw_hi_g, shrimp_per_kg, cv, n, flags, ' +
  'image_file_id, net_id, rim_ellipse, ref_diameter_cm, rim_radius_px, canvas_px, shrimp_xy, sam3_calls, sam3_http_attempts'
/** line-bot migration 210, not on every database yet: read and written only while it is there. */
const LEN_COL = 'shrimp_len_px'

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
  abw_lo_g: number | string | null
  abw_hi_g: number | string | null
  shrimp_per_kg: number | string | null
  /** Percent (line-bot writes estimate.cv_pct). */
  cv: number | string | null
  n: number | null
  flags: string[] | null
  image_file_id: string | null
  net_id: string | null
  rim_ellipse: number[] | null
  ref_diameter_cm: number | string | null
  rim_radius_px: number | null
  canvas_px: number | null
  shrimp_xy: number[] | null
  shrimp_len_px?: number[] | null
  sam3_calls: number | null
  sam3_http_attempts: number | null
}

export function toScan(r: ScanDbRow): ScanRow {
  const cvPct = num(r.cv)
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
    abwLo: num(r.abw_lo_g),
    abwHi: num(r.abw_hi_g),
    perKg: num(r.shrimp_per_kg),
    cv: cvPct === null ? null : cvPct / 100,
    n: r.n,
    flags: r.flags ?? [],
    imageFileId: r.image_file_id,
    netId: r.net_id,
    rim: r.rim_ellipse,
    refCm: num(r.ref_diameter_cm),
    rimRadiusPx: r.rim_radius_px,
    canvasPx: r.canvas_px,
    shrimpXy: r.shrimp_xy,
    lenPx: r.shrimp_len_px ?? null,
    sam3Calls: r.sam3_calls,
    sam3HttpAttempts: r.sam3_http_attempts,
  }
}

const COLUMN: Record<keyof ScanPatch, string> = {
  status: 'status',
  sampleDate: 'sample_date',
  sampleDateSource: 'sample_date_source',
  measuredAt: 'measured_at',
  abw: 'abw_g',
  abwLo: 'abw_lo_g',
  abwHi: 'abw_hi_g',
  perKg: 'shrimp_per_kg',
  cv: 'cv',
  n: 'n',
  flags: 'flags',
  netId: 'net_id',
  rim: 'rim_ellipse',
  refCm: 'ref_diameter_cm',
  rimRadiusPx: 'rim_radius_px',
  canvasPx: 'canvas_px',
  shrimpXy: 'shrimp_xy',
  lenPx: LEN_COL,
  retakeReason: 'retake_reason',
  errorCode: 'error_code',
  pxLengths: 'px_lengths',
  pipelineVersion: 'pipeline_version',
  sam3Calls: 'sam3_calls',
  sam3HttpAttempts: 'sam3_http_attempts',
}

/** The patch as columns; cv goes back to the percent. */
export function toDbPatch(patch: ScanPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(patch) as [keyof ScanPatch, unknown][]) {
    if (v === undefined) continue
    out[COLUMN[key]] = key === 'cv' && typeof v === 'number' ? Math.round(v * 10_000) / 100 : v
  }
  return out
}

/** PostgREST's "no such column" for shrimp_len_px: 42703 on a read, PGRST204 on a write. */
function lacksLenColumn(error: PgError): boolean {
  return (error.code === '42703' || error.code === 'PGRST204') && String(error.message ?? '').includes(LEN_COL)
}

type Answer = { data: unknown; error: PgError | null }

export function supabaseScans(db: SupabaseClient): ScansRepo {
  // Until a call finds the column missing; then never again in this process (a deploy after 210 starts over).
  let hasLen = true
  const cols = () => (hasLen ? `${BASE_COLS}, ${LEN_COL}` : BASE_COLS)
  const noLen = (why: PgError) => {
    hasLen = false
    logger.warn('[db] sizing_measurements has no shrimp_len_px (line-bot migration 210): per-shrimp sizes are not kept', { error: why.message })
  }
  /** Runs a read with the columns, once more without shrimp_len_px if the database lacks it. */
  const withCols = async (run: (c: string) => PromiseLike<Answer>): Promise<Answer> => {
    const first = await run(cols())
    if (!first.error || !hasLen || !lacksLenColumn(first.error)) return first
    noLen(first.error)
    return run(cols())
  }
  const rows = (data: unknown) => ((data as ScanDbRow[] | null) ?? []).map(toScan)

  return {
    async savedOfFarm(farmId, sinceDay) {
      const { data, error } = await withCols((c) =>
        db
          .from('sizing_measurements')
          .select(c)
          .eq('farm_id', farmId)
          .gte('sample_date', sinceDay)
          .order('sample_date', { ascending: false })
          .order('created_at', { ascending: false }),
      )
      if (error) throw dbFail('sizing_measurements.savedOfFarm', error)
      return rows(data)
    },
    async scanDays(farmId, sinceDay) {
      // Two small columns, read a page at a time: PostgREST hands back at most
      // 1000 rows a request, and 60 ponds over 13 weeks is more than that.
      const out: { pondId: string; sampleDate: string }[] = []
      for (let from = 0; from < SCAN_DAYS_MAX; from += SCAN_DAYS_PAGE) {
        const { data, error } = await db
          .from('sizing_measurements')
          .select('id, pond_id, sample_date')
          .eq('farm_id', farmId)
          .gte('sample_date', sinceDay)
          .order('sample_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, from + SCAN_DAYS_PAGE - 1)
        if (error) throw dbFail('sizing_measurements.scanDays', error)
        const page = (data ?? []) as { pond_id: string; sample_date: string }[]
        for (const r of page) out.push({ pondId: r.pond_id, sampleDate: r.sample_date })
        if (page.length < SCAN_DAYS_PAGE) break
      }
      return out
    },
    async savedOfPond(pondId) {
      const { data, error } = await withCols((c) =>
        db
          .from('sizing_measurements')
          .select(c)
          .eq('pond_id', pondId)
          .not('sample_date', 'is', null)
          .order('sample_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(POND_SCANS_MAX),
      )
      if (error) throw dbFail('sizing_measurements.savedOfPond', error)
      return rows(data)
    },
    async byId(id) {
      // A path id that is not a uuid would be a Postgres cast error, not a miss.
      if (!UUID.test(id)) return null
      const { data, error } = await withCols((c) => db.from('sizing_measurements').select(c).eq('id', id).maybeSingle())
      if (error) throw dbFail('sizing_measurements.byId', error)
      return data ? toScan(data as ScanDbRow) : null
    },
    async bySha(farmId, sha256) {
      const { data, error } = await withCols((c) => db.from('sizing_measurements').select(c).eq('farm_id', farmId).eq('photo_sha256', sha256).maybeSingle())
      if (error) throw dbFail('sizing_measurements.bySha', error)
      return data ? toScan(data as ScanDbRow) : null
    },
    async create({ farmId, pondId, lineUserId, sha256, flags }) {
      const { data, error } = await withCols((c) =>
        db
          .from('sizing_measurements')
          .insert({ farm_id: farmId, pond_id: pondId, line_user_id: lineUserId, photo_sha256: sha256, status: 'queued', flags })
          .select(c)
          .single(),
      )
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
    async update(id, patch) {
      const values = toDbPatch(patch)
      const send = () =>
        db
          .from('sizing_measurements')
          .update(hasLen ? values : Object.fromEntries(Object.entries(values).filter(([k]) => k !== LEN_COL)))
          .eq('id', id)
      let { error } = await send()
      if (error && hasLen && LEN_COL in values && lacksLenColumn(error)) {
        noLen(error)
        ;({ error } = await send())
      }
      if (error) throw dbFail('sizing_measurements update', error)
    },
    async unsaveDay(pondId, day, keepId) {
      const { error } = await db
        .from('sizing_measurements')
        .update({ sample_date: null, sample_date_source: null })
        .eq('pond_id', pondId)
        .eq('sample_date', day)
        .neq('id', keepId)
      if (error) throw dbFail('sizing_measurements unsaveDay', error)
    },
    async remove(id) {
      const { error } = await db.from('sizing_measurements').delete().eq('id', id)
      if (error) throw dbFail('sizing_measurements delete', error)
    },
  }
}
