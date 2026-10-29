import type { SupabaseClient } from '@supabase/supabase-js'
import type { Repos } from '../types.js'
import { supabaseFarms } from './farms.js'
import { supabaseMembers } from './members.js'
import { supabasePeople } from './people.js'
import { supabasePonds } from './ponds.js'
import { supabaseQuota } from './quota.js'

export function createSupabaseRepos(db: SupabaseClient): Repos {
  return {
    farms: supabaseFarms(db),
    members: supabaseMembers(db),
    ponds: supabasePonds(db),
    people: supabasePeople(db),
    quota: supabaseQuota(db),
  }
}
