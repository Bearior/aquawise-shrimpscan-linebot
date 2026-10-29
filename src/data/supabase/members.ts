import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role } from '../../contract/types.js'
import type { MemberRow, MemberStatus, MembersRepo } from '../types.js'
import { dbFail } from './errors.js'

const COLS = 'id, farm_id, member_line_user_id, role, display_name, pond_ids, status'

interface Row {
  id: string
  farm_id: string
  member_line_user_id: string
  role: Role
  display_name: string | null
  pond_ids: string[] | null
  status: MemberStatus
}

function toMember(r: Row): MemberRow {
  return {
    id: r.id,
    farmId: r.farm_id,
    lineUserId: r.member_line_user_id,
    role: r.role,
    name: r.display_name ?? '',
    pondIds: r.pond_ids ?? [],
    status: r.status,
  }
}

export function supabaseMembers(db: SupabaseClient): MembersRepo {
  return {
    async activeFor(lineUserId) {
      // A legacy row with no farm_id belongs to น้องน้ำ: the footprint check reads it.
      const { data, error } = await db
        .from('farm_members')
        .select(COLS)
        .eq('member_line_user_id', lineUserId)
        .eq('status', 'active')
        .not('farm_id', 'is', null)
        .order('joined_at', { ascending: false })
        .limit(1)
      if (error) throw dbFail('farm_members.activeFor', error)
      const row = (data as Row[] | null)?.[0]
      return row ? toMember(row) : null
    },
    async ofFarm(farmId) {
      const { data, error } = await db
        .from('farm_members')
        .select(COLS)
        .eq('farm_id', farmId)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
      if (error) throw dbFail('farm_members.ofFarm', error)
      return ((data as Row[] | null) ?? []).map(toMember)
    },
  }
}
