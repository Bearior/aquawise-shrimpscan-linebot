/**
 * In-memory repositories for the route tests. The state is plain arrays the
 * test can seed and read back, so a test asserts what was written, not which
 * calls were made.
 */

import type { FarmRow, MemberRow, Repos } from './types.js'

export interface MemoryState {
  farms: FarmRow[]
  members: MemberRow[]
}

export type MemoryRepos = Repos & { state: MemoryState }

export function createMemoryRepos(seed: Partial<MemoryState> = {}): MemoryRepos {
  const state: MemoryState = {
    farms: [...(seed.farms ?? [])],
    members: [...(seed.members ?? [])],
  }
  return {
    state,
    farms: {
      async byId(id) {
        return state.farms.find((f) => f.id === id) ?? null
      },
    },
    members: {
      async activeFor(lineUserId) {
        // Newest first: a later membership wins, as `joined_at desc` does in the database.
        return [...state.members].reverse().find((m) => m.lineUserId === lineUserId && m.status === 'active') ?? null
      },
    },
  }
}
