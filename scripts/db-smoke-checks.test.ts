import { describe, expect, it } from 'vitest'
import { dbLabel, smokeChecks, type SmokeDb } from './db-smoke-checks.js'

type Answer = { data?: unknown; count?: number | null; error: { message: string; code?: string } | null }

/** A database that answers each table and RPC as given, and records the RPC arguments. */
function fakeDb(tables: Record<string, Answer>, rpcs: Record<string, Answer>) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const db: SmokeDb = {
    from: (table) => ({ select: async () => tables[table] ?? { data: null, error: { message: 'no such table', code: 'PGRST205' } } }),
    rpc: async (fn, args) => {
      calls.push({ fn, args })
      return rpcs[fn] ?? { data: null, error: { message: 'no such function' } }
    },
  }
  return { db, calls }
}

const FARMS: Answer = { data: [{ created_via: 'line_bot' }, { created_via: 'shrimp_scan_oa' }, { created_via: null }, { created_via: 'line_bot' }], error: null }

describe('db smoke checks', () => {
  it('counts farms by how they were made, finds the settings table, asks the quota of an unknown farm; prints no id', async () => {
    const { db, calls } = fakeDb(
      { farms: FARMS, shrimp_scan_farm_settings: { data: null, count: 3, error: null } },
      { sizing_quota_status: { data: [{ day: '2026-10-29', used: 0, remaining: 20 }], error: null } },
    )
    const out = await smokeChecks(db, 20)
    expect(out.ok).toBe(true)
    expect(out.lines).toEqual([
      'farms                      line_bot 2 · shrimp_scan_oa 1 · (none) 1',
      'shrimp_scan_farm_settings  there, 3 rows',
      'sizing_quota_status        answers: 20 of 20 left for a farm with no scans',
    ])
    expect(calls).toHaveLength(1)
    const farmId = calls[0]!.args.p_farm_id as string
    expect(farmId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(calls[0]!.args.p_limit).toBe(20)
    expect(out.lines.join('\n')).not.toContain(farmId)
  })

  it('a missing table or a failing RPC is a failed line, and the run fails', async () => {
    const { db } = fakeDb({ farms: FARMS }, {})
    const out = await smokeChecks(db, 20)
    expect(out.ok).toBe(false)
    expect(out.lines[1]).toBe('shrimp_scan_farm_settings  FAILED: no such table (PGRST205)')
    expect(out.lines[2]).toBe('sizing_quota_status        FAILED: no such function')
  })

  it('names the project by its ref and prints no other part of the URL', () => {
    expect(dbLabel('https://gydtpgeequcfbrvgubso.supabase.co')).toBe('prod')
    expect(dbLabel('https://jysoyhdvnqgnvrlfsisk.supabase.co/')).toBe('staging')
    expect(dbLabel('http://127.0.0.1:54321')).toBe('another database')
  })
})
