/**
 * `farm_invites`, the table น้องน้ำ's invites live in too. A row names its
 * farm by the key (the owner's LINE id), never by farm id; the routes check
 * the key holds a farm this OA made before they show or take an invite.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { InviteRow, InviteStatus, InvitesRepo } from '../types.js'
import { dbFail, isUniqueViolation } from './errors.js'

const COLS = 'id, farm_owner_line_user_id, code, role, pond_ids, status, expires_at, created_at, created_by_line_user_id'

interface Row {
  id: string
  farm_owner_line_user_id: string
  code: string
  role: InviteRow['role']
  pond_ids: string[] | null
  status: InviteStatus
  expires_at: string
  created_at: string
  created_by_line_user_id: string | null
}

function toInvite(r: Row): InviteRow {
  return {
    id: r.id,
    farmKey: r.farm_owner_line_user_id,
    // CHAR(6): PostgREST pads nothing for six characters, but trim in case the column ever widens.
    code: r.code.trim(),
    role: r.role,
    pondIds: r.pond_ids ?? [],
    status: r.status,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    createdBy: r.created_by_line_user_id,
  }
}

export function supabaseInvites(db: SupabaseClient): InvitesRepo {
  return {
    async pendingOf(farmKey) {
      const { data, error } = await db
        .from('farm_invites')
        .select(COLS)
        .eq('farm_owner_line_user_id', farmKey)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw dbFail('farm_invites.pendingOf', error)
      return ((data as Row[] | null) ?? []).map(toInvite)
    },

    async create({ farmKey, createdBy, code, token, role, pondIds, expiresAt }) {
      const { data, error } = await db
        .from('farm_invites')
        .insert({
          farm_owner_line_user_id: farmKey,
          created_by_line_user_id: createdBy,
          code,
          token,
          role,
          scope: pondIds.length ? 'custom' : 'all',
          pond_ids: pondIds,
          expires_at: expiresAt,
          status: 'pending',
        })
        .select(COLS)
        .single()
      if (error && isUniqueViolation(error) && /code/.test(String(error.message ?? ''))) return 'code_taken'
      if (error || !data) throw dbFail('farm_invites.create', error)
      return toInvite(data as Row)
    },

    async byCode(code) {
      const { data, error } = await db.from('farm_invites').select(COLS).eq('code', code).maybeSingle()
      if (error) throw dbFail('farm_invites.byCode', error)
      return data ? toInvite(data as Row) : null
    },

    async cancel(farmKey, code) {
      const { data, error } = await db
        .from('farm_invites')
        .update({ status: 'cancelled' })
        .eq('farm_owner_line_user_id', farmKey)
        .eq('code', code)
        .eq('status', 'pending')
        .select('id')
      if (error) throw dbFail('farm_invites.cancel', error)
      return ((data as unknown[] | null) ?? []).length > 0
    },

    async claim(id, lineUserId) {
      // Conditional on pending: of two people taking one invite at once, one gets it.
      const { data, error } = await db
        .from('farm_invites')
        .update({ status: 'claimed', claimed_by_line_user_id: lineUserId, claimed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'pending')
        .select('id')
      if (error) throw dbFail('farm_invites.claim', error)
      return ((data as unknown[] | null) ?? []).length > 0
    },

    async unclaim(id) {
      const { error } = await db
        .from('farm_invites')
        .update({ status: 'pending', claimed_by_line_user_id: null, claimed_at: null })
        .eq('id', id)
        .eq('status', 'claimed')
      if (error) throw dbFail('farm_invites.unclaim', error)
    },
  }
}
