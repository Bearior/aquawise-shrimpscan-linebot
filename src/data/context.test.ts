import { describe, it, expect } from 'vitest'
import { ApiError, requireFarm, resolveContext } from './context.js'
import { createMemoryRepos } from './memory.js'

const OWNER = 'Uowner'

function seeded(createdVia: string, status: 'active' | 'removed' | 'left' = 'active') {
  return createMemoryRepos({
    farms: [{ id: 'f1', name: 'ฟาร์มทดสอบ', createdBy: OWNER, createdVia, accessLevel: 'scan_only' }],
    members: [{ id: 'm1', farmId: 'f1', lineUserId: OWNER, role: 'owner', name: 'พี่วิชัย', pondIds: [], status }],
  })
}

describe('resolveContext', () => {
  it('reads a person with no membership as farmless and not blocked', async () => {
    const ctx = await resolveContext(createMemoryRepos(), 'Unobody')
    expect(ctx).toEqual({ lineUserId: 'Unobody', farm: null, me: null, blocked: false })
  })

  it('blocks a person whose farm was made outside this OA', async () => {
    const ctx = await resolveContext(seeded('onboarding'), OWNER)
    expect(ctx.blocked).toBe(true)
    expect(() => requireFarm(ctx)).toThrow(ApiError)
    try {
      requireFarm(ctx)
    } catch (e) {
      expect((e as ApiError).status).toBe(403)
      expect((e as ApiError).code).toBe('use_nong_nam')
    }
  })

  it('gives the stored role in a farm this OA made', async () => {
    const ctx = await resolveContext(seeded('shrimp_scan_oa'), OWNER)
    expect(ctx.blocked).toBe(false)
    const { farm, me } = requireFarm(ctx)
    expect(farm.id).toBe('f1')
    expect(me.role).toBe('owner')
  })

  it('ignores a membership that was removed or left', async () => {
    for (const status of ['removed', 'left'] as const) {
      const ctx = await resolveContext(seeded('shrimp_scan_oa', status), OWNER)
      expect(ctx.farm).toBeNull()
      expect(ctx.blocked).toBe(false)
    }
  })

  it('answers 409 no_farm for a farmless person', async () => {
    const ctx = await resolveContext(createMemoryRepos(), 'Unobody')
    try {
      requireFarm(ctx)
      expect.unreachable()
    } catch (e) {
      expect((e as ApiError).status).toBe(409)
      expect((e as ApiError).code).toBe('no_farm')
    }
  })
})
