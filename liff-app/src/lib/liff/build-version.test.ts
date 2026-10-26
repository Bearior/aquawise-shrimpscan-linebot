import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkBuildFreshness } from './build-version'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})

const answer = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response)

describe('checkBuildFreshness', () => {
  beforeEach(() => store.clear())

  it('does nothing on a dev bundle', async () => {
    const reload = vi.fn()
    expect(await checkBuildFreshness({ baked: 'dev', fetchFn: answer({ build_id: 'b2' }), reload })).toBe('unknown')
    expect(reload).not.toHaveBeenCalled()
  })

  it('is fresh when the ids match', async () => {
    expect(await checkBuildFreshness({ baked: 'b1', fetchFn: answer({ build_id: 'b1' }), reload: vi.fn() })).toBe('fresh')
  })

  it('reloads once on a mismatch, then holds off for 10 minutes', async () => {
    const reload = vi.fn()
    expect(await checkBuildFreshness({ baked: 'b1', fetchFn: answer({ build_id: 'b2' }), reload })).toBe('reloading')
    expect(await checkBuildFreshness({ baked: 'b1', fetchFn: answer({ build_id: 'b2' }), reload })).toBe('skipped')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('stays put when the server cannot say', async () => {
    const reload = vi.fn()
    expect(await checkBuildFreshness({ baked: 'b1', fetchFn: answer({}, false), reload })).toBe('unknown')
    expect(await checkBuildFreshness({ baked: 'b1', fetchFn: answer({ build_id: 'unknown' }), reload })).toBe('unknown')
    expect(reload).not.toHaveBeenCalled()
  })
})
