import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { supabaseScans, toScan, type ScanDbRow } from './scans.js'

type Answer = { data?: unknown; error: { code: string; message: string } | null }

interface Query extends PromiseLike<Answer> {
  eq(col: string, v: unknown): Query
  neq(col: string, v: unknown): Query
  maybeSingle(): Promise<Answer>
}

/** Just enough of the client for byId and update: each call is logged, the answers come in turn. */
function fakeDb(answers: Answer[]) {
  const calls: { op: 'select' | 'update'; arg: unknown }[] = []
  let i = 0
  const next = () => answers[Math.min(i++, answers.length - 1)]!
  const query = (op: 'select' | 'update', arg: unknown): Query => {
    calls.push({ op, arg })
    const q: Query = {
      eq: () => q,
      neq: () => q,
      maybeSingle: async () => next(),
      then: (ok, fail) => Promise.resolve(next()).then(ok, fail),
    }
    return q
  }
  const db = { from: () => ({ select: (cols: string) => query('select', cols), update: (v: unknown) => query('update', v) }) }
  return { db: db as unknown as SupabaseClient, calls }
}

const dbRow: ScanDbRow = {
  id: 's1', farm_id: 'f', pond_id: 'p1', line_user_id: 'U', status: 'ok', sample_date: null, measured_at: null,
  created_at: '2026-10-29T03:00:00Z', abw_g: '13.9', abw_lo_g: '12.1', abw_hi_g: '15.2', shrimp_per_kg: '72', cv: '18', n: 3,
  flags: [], image_file_id: 'img', net_id: 'net', rim_ellipse: [0.5, 0.5, 0.4, 0.4, 0], ref_diameter_cm: '82', rim_radius_px: 400,
  canvas_px: 800, shrimp_xy: [0.1, 0.2], shrimp_len_px: [200], sam3_calls: 2, sam3_http_attempts: 2,
}

describe('the scans mapper', () => {
  it('reads cv as 0..1: the column holds the percent line-bot writes (estimate.cv_pct)', () => {
    expect(toScan(dbRow)).toMatchObject({ cv: 0.18, abw: 13.9, abwLo: 12.1, abwHi: 15.2, refCm: 82, rimRadiusPx: 400, canvasPx: 800, lenPx: [200] })
  })

  it('writes cv back as the percent', async () => {
    const { db, calls } = fakeDb([{ error: null }])
    await supabaseScans(db).update('s1', { cv: 0.18, abw: 13.9 })
    expect(calls[0]!.arg).toEqual({ cv: 18, abw_g: 13.9 })
  })
})

describe('a database without shrimp_len_px (line-bot migration 210)', () => {
  const missingOnWrite = { code: 'PGRST204', message: "Could not find the 'shrimp_len_px' column of 'sizing_measurements' in the schema cache" }
  const missingOnRead = { code: '42703', message: 'column sizing_measurements.shrimp_len_px does not exist' }

  it('a write drops the lengths and keeps the rest, then stops sending them', async () => {
    const { db, calls } = fakeDb([{ error: missingOnWrite }, { error: null }])
    const scans = supabaseScans(db)
    await scans.update('s1', { status: 'ok', lenPx: [200] })
    await scans.update('s1', { status: 'ok', lenPx: [200] })
    expect(calls.map((c) => c.arg)).toEqual([{ status: 'ok', shrimp_len_px: [200] }, { status: 'ok' }, { status: 'ok' }])
  })

  it('a read asks again without the column, and reads no lengths', async () => {
    const older: ScanDbRow = { ...dbRow }
    delete older.shrimp_len_px
    const { db, calls } = fakeDb([{ error: missingOnRead }, { data: older, error: null }])
    const scans = supabaseScans(db)
    expect((await scans.byId('00000000-0000-4000-8000-000000000001'))!.lenPx).toBeNull()
    await scans.byId('00000000-0000-4000-8000-000000000001')
    expect(calls.map((c) => String(c.arg).includes('shrimp_len_px'))).toEqual([true, false, false])
  })

  it('any other error still throws', async () => {
    const { db } = fakeDb([{ error: { code: '23514', message: 'check violation' } }])
    await expect(supabaseScans(db).update('s1', { status: 'ok' })).rejects.toThrow()
  })
})
