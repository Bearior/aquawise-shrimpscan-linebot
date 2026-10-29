import type { SupabaseClient } from '@supabase/supabase-js'
import type { CycleRow, CyclesRepo } from '../types.js'
import { dbFail, isUniqueViolation } from './errors.js'
import { num } from './num.js'

/** The states one_open_cycle_per_pond counts as open. */
const OPEN_STATES = ['setup', 'preparing', 'active']
const COLS = 'id, pond_id, stocking_date, stocking_count, target_survival_pct'

interface Row {
  id: string
  pond_id: string
  stocking_date: string | null
  stocking_count: number | null
  target_survival_pct: number | string | null
}

function toCycle(r: Row): CycleRow {
  const pct = num(r.target_survival_pct)
  return { id: r.id, pondId: r.pond_id, stockedOn: r.stocking_date, count: r.stocking_count, survival: pct === null ? null : pct / 100 }
}

export function supabaseCycles(db: SupabaseClient): CyclesRepo {
  async function openOf(pondId: string): Promise<CycleRow | null> {
    const { data, error } = await db.from('cycles').select(COLS).eq('pond_id', pondId).in('state', OPEN_STATES).limit(1)
    if (error) throw dbFail('cycles.openOf', error)
    const row = (data as Row[] | null)?.[0]
    return row ? toCycle(row) : null
  }

  return {
    openOf,
    async openOfFarm(farmId) {
      const { data, error } = await db.from('cycles').select(COLS).eq('farm_id', farmId).in('state', OPEN_STATES)
      if (error) throw dbFail('cycles.openOfFarm', error)
      return ((data as Row[] | null) ?? []).map(toCycle)
    },
    async saveStocking({ farmId, pondId, farmKey, stocking }) {
      const patch = {
        stocking_date: stocking.stockedOn,
        stocking_count: stocking.count,
        // ไม่แน่ใจ is stored as null, not the column's default 80.
        target_survival_pct: stocking.survival === null ? null : Math.round(stocking.survival * 10_000) / 100,
      }
      const update = async (id: string) => {
        const { error } = await db.from('cycles').update(patch).eq('id', id)
        if (error) throw dbFail('cycles update', error)
      }
      const open = await openOf(pondId)
      if (open) return update(open.id)
      const ins = await db.from('cycles').insert({ pond_id: pondId, farm_id: farmId, line_user_id: farmKey, state: 'active', ...patch })
      if (!ins.error) return
      // Another request opened the cycle first (one_open_cycle_per_pond): write onto that one.
      if (!isUniqueViolation(ins.error)) throw dbFail('cycles insert', ins.error)
      const again = await openOf(pondId)
      if (!again) throw dbFail('cycles insert', ins.error)
      return update(again.id)
    },
  }
}
