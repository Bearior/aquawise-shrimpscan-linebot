import type { SupabaseClient } from '@supabase/supabase-js'
import type { Repos } from '../types.js'
import { supabaseCycles } from './cycles.js'
import { supabaseFarms } from './farms.js'
import { supabaseGrowth } from './growth.js'
import { supabaseMembers } from './members.js'
import { supabaseNets } from './nets.js'
import { supabasePeople } from './people.js'
import { supabasePhotos } from './photos.js'
import { supabasePonds } from './ponds.js'
import { supabaseQuota } from './quota.js'
import { supabaseScans } from './scans.js'

export function createSupabaseRepos(db: SupabaseClient): Repos {
  return {
    farms: supabaseFarms(db),
    members: supabaseMembers(db),
    ponds: supabasePonds(db),
    people: supabasePeople(db),
    quota: supabaseQuota(db),
    nets: supabaseNets(db),
    scans: supabaseScans(db),
    cycles: supabaseCycles(db),
    photos: supabasePhotos(db),
    growth: supabaseGrowth(db),
  }
}
