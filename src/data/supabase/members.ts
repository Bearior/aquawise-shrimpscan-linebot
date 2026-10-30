import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role } from '../../contract/types.js'
import type { MemberRow, MemberStatus, MembersRepo } from '../types.js'
import { dbFail } from './errors.js'

const COLS = 'id, farm_id, member_line_user_id, role, display_name, pond_ids, status, joined_at'

interface Row {
  id: string
  farm_id: string
  member_line_user_id: string
  role: Role
  display_name: string | null
  pond_ids: string[] | null
  status: MemberStatus
  joined_at: string | null
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
    joinedAt: r.joined_at,
  }
}

/** `scope` says how `pond_ids` reads in น้องน้ำ: some ponds, or every pond when there is no list. */
const scopeOf = (pondIds: string[]) => (pondIds.length ? 'custom' : 'all')

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
    async byId(farmId, id) {
      // A row id that is not a uuid is nobody: PostgREST would answer 22P02.
      if (!UUID.test(id)) return null
      const { data, error } = await db.from('farm_members').select(COLS).eq('id', id).eq('farm_id', farmId).eq('status', 'active').maybeSingle()
      if (error) throw dbFail('farm_members.byId', error)
      return data ? toMember(data as Row) : null
    },
    async setRole(id, role) {
      const { error } = await db.from('farm_members').update({ role }).eq('id', id)
      if (error) throw dbFail('farm_members.setRole', error)
    },
    async setPonds(id, pondIds) {
      const { error } = await db.from('farm_members').update({ pond_ids: pondIds, scope: scopeOf(pondIds) }).eq('id', id)
      if (error) throw dbFail('farm_members.setPonds', error)
    },
    async remove(id) {
      const { error } = await db.from('farm_members').update({ status: 'removed', pond_ids: [] }).eq('id', id)
      if (error) throw dbFail('farm_members.remove', error)
    },
    async setName(id, name) {
      const { error } = await db.from('farm_members').update({ display_name: name }).eq('id', id)
      if (error) throw dbFail('farm_members.setName', error)
    },
    async join({ farmId, farmKey, lineUserId, role, name, pondIds, inviteId }) {
      // ON CONFLICT DO UPDATE touches only these columns: a returning person keeps joined_at,
      // and a name left out keeps the one on the row (line-bot routes/invites.ts accept).
      const { error } = await db.from('farm_members').upsert(
        {
          farm_owner_line_user_id: farmKey,
          member_line_user_id: lineUserId,
          role,
          status: 'active',
          ...(name ? { display_name: name } : {}),
          scope: scopeOf(pondIds),
          pond_ids: pondIds,
          source_invite_id: inviteId,
          farm_id: farmId,
        },
        { onConflict: 'farm_owner_line_user_id,member_line_user_id' },
      )
      if (error) throw dbFail('farm_members.join', error)
    },
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
