import { describe, expect, it, vi } from 'vitest'
import { createMemoryRepos } from '../../data/memory.js'
import { resolveContext } from '../../data/context.js'
import type { FarmRow, MemberRow } from '../../data/types.js'
import { picturesOf, refreshProfile } from './profile.js'

const farm: FarmRow = { id: 'farm-oa', name: 'ฟาร์มสายน้ำ', createdBy: 'Uowner', createdVia: 'shrimp_scan_oa', accessLevel: 'scan_only' }
const nongNam: FarmRow = { id: 'farm-nn', name: 'ฟาร์มน้องน้ำ', createdBy: 'Unn', createdVia: 'onboarding', accessLevel: 'platform' }
const owner: MemberRow = { id: 'm-owner', farmId: farm.id, lineUserId: 'Uowner', role: 'owner', name: 'พี่วิชัย', pondIds: [], status: 'active' }
const worker: MemberRow = { id: 'm-worker', farmId: farm.id, lineUserId: 'Uworker', role: 'worker', name: 'น้องเอ', pondIds: [], status: 'active' }
const nnOwner: MemberRow = { id: 'm-nn', farmId: nongNam.id, lineUserId: 'Unn', role: 'owner', name: 'พี่ใหญ่', pondIds: [], status: 'active' }
const user = (id: string) => ({ id, platformAccess: 'scan_only' as const, signupSource: 'shrimp_scan_oa', onboarded: false, erased: false })

function seeded() {
  return createMemoryRepos({ farms: [farm, nongNam], members: [owner, worker, nnOwner], lineUsers: [user('Uowner'), user('Uworker'), user('Unn')] })
}

describe('refreshProfile', () => {
  it('keeps LINE’s picture on line_users and LINE’s name on the membership', async () => {
    const repos = seeded()
    const ctx = await resolveContext(repos, 'Uworker')
    await refreshProfile(repos, ctx, 'เอ ช่างไฟ', 'https://profile.line-scdn.net/a1')
    expect(repos.state.lineUsers.find((u) => u.id === 'Uworker')?.pictureUrl).toBe('https://profile.line-scdn.net/a1')
    expect(repos.state.members.find((m) => m.id === 'm-worker')?.name).toBe('เอ ช่างไฟ')
    expect((await picturesOf(repos, repos.state.members)).get('Uworker')).toBe('https://profile.line-scdn.net/a1')
  })

  it('writes a picture once, and again only when LINE’s changes', async () => {
    const repos = seeded()
    const spy = vi.spyOn(repos.people, 'setPicture')
    const ctx = await resolveContext(repos, 'Uowner')
    await refreshProfile(repos, ctx, undefined, 'https://profile.line-scdn.net/o1')
    await refreshProfile(repos, ctx, undefined, 'https://profile.line-scdn.net/o1')
    expect(spy).toHaveBeenCalledTimes(1)
    await refreshProfile(repos, ctx, undefined, 'https://profile.line-scdn.net/o2')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('writes nothing for a person with no farm here, or one from น้องน้ำ', async () => {
    const repos = seeded()
    const spy = vi.spyOn(repos.people, 'setPicture')
    await refreshProfile(repos, await resolveContext(repos, 'Unobody'), 'x', 'https://profile.line-scdn.net/n')
    await refreshProfile(repos, await resolveContext(repos, 'Unn'), 'x', 'https://profile.line-scdn.net/n')
    expect(spy).not.toHaveBeenCalled()
    expect(repos.state.members.find((m) => m.id === 'm-nn')?.name).toBe('พี่ใหญ่')
  })

  it('never throws: a failed write leaves the screen as it was', async () => {
    const repos = seeded()
    vi.spyOn(repos.people, 'setPicture').mockRejectedValue(new Error('db down'))
    vi.spyOn(repos.people, 'pictures').mockRejectedValue(new Error('db down'))
    const ctx = await resolveContext(repos, 'Uworker')
    await expect(refreshProfile(repos, ctx, undefined, 'https://profile.line-scdn.net/w9')).resolves.toBeUndefined()
    expect((await picturesOf(repos, [worker])).size).toBe(0)
  })
})
