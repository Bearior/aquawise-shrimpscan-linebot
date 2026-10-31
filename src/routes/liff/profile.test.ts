import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRepos } from '../../data/memory.js'
import { resolveContext } from '../../data/context.js'
import type { FarmRow, MemberRow } from '../../data/types.js'
import { __resetProfileMemory, picturesOf, refreshProfile } from './profile.js'

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
  beforeEach(() => __resetProfileMemory())

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

describe('picturesOf asks LINE for anyone without a kept picture', () => {
  const saved = { secret: process.env.LINE_CHANNEL_SECRET, token: process.env.LINE_CHANNEL_ACCESS_TOKEN }
  const fetchMock = vi.fn()
  /** LINE's bot profile answer per person: a picture, or a 404 (not a friend of the OA). */
  function lineSays(pictures: Record<string, string | undefined>) {
    fetchMock.mockImplementation(async (url: string) => {
      const id = decodeURIComponent(url.split('/').pop() ?? '')
      const picture = pictures[id]
      return picture ? new Response(JSON.stringify({ userId: id, displayName: 'x', pictureUrl: picture })) : new Response('{}', { status: 404 })
    })
  }

  beforeEach(() => {
    __resetProfileMemory()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    process.env.LINE_CHANNEL_SECRET = 'test-secret'
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    for (const [k, v] of [['LINE_CHANNEL_SECRET', saved.secret], ['LINE_CHANNEL_ACCESS_TOKEN', saved.token]] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('shows and keeps the picture of a worker who has not opened the app since joining', async () => {
    const repos = seeded()
    lineSays({ Uworker: 'https://profile.line-scdn.net/w1' })
    expect((await picturesOf(repos, [owner, worker])).get('Uworker')).toBe('https://profile.line-scdn.net/w1')
    expect(repos.state.lineUsers.find((u) => u.id === 'Uworker')?.pictureUrl).toBe('https://profile.line-scdn.net/w1')
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/Uworker')) ?? []
    expect(url).toBe('https://api.line.me/v2/bot/profile/Uworker')
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer test-token' })
  })

  it('asks nothing for a picture already kept', async () => {
    const repos = seeded()
    await repos.people.setPicture('Uworker', 'https://profile.line-scdn.net/kept')
    lineSays({})
    expect((await picturesOf(repos, [worker])).get('Uworker')).toBe('https://profile.line-scdn.net/kept')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a person LINE has no picture for is a letter, and is not asked again within six hours', async () => {
    const repos = seeded()
    lineSays({})
    expect((await picturesOf(repos, [worker])).size).toBe(0)
    expect((await picturesOf(repos, [worker])).size).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('takes only a LINE-hosted https picture, and a LINE that fails is no picture', async () => {
    const repos = seeded()
    lineSays({ Uworker: 'https://evil.example/w.png' })
    expect((await picturesOf(repos, [worker])).size).toBe(0)
    __resetProfileMemory()
    fetchMock.mockRejectedValue(new Error('timeout'))
    await expect(picturesOf(repos, [worker])).resolves.toEqual(new Map())
  })

  it('asks nothing while the LINE channel is not set up', async () => {
    const repos = seeded()
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN
    lineSays({ Uworker: 'https://profile.line-scdn.net/w1' })
    expect((await picturesOf(repos, [worker])).size).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
