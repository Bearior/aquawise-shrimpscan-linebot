import { describe, expect, it } from 'vitest'
import type { MemberRow } from '../data/types.js'
import { DEFAULTS } from './permissions.js'
import { NOTIFY_DEFAULTS, permsOf, settingsFromJson, settingsToJson } from './settings.js'

const member = (role: MemberRow['role'], id = 'm1'): MemberRow => ({ id, farmId: 'f', lineUserId: 'U', role, name: '', pondIds: [], status: 'active' })

describe('settingsFromJson', () => {
  it('a row never saved, or not an object, is all defaults', () => {
    for (const raw of [undefined, null, {}, [], 'x']) expect(settingsFromJson(raw)).toEqual({ notify: NOTIFY_DEFAULTS, perms: {}, acks: {}, zones: {} })
  })

  it('keeps what is the right type and drops the rest', () => {
    const s = settingsFromJson({
      photoIn: false,
      nearTarget: 'no',
      perms: { m1: { printSheet: false, farmOverview: 'yes' }, m2: 7 },
      acks: { slow: { signature: 'B01', by: 'พี่บี', at: '08:10' }, bad: { signature: 1 } },
    })
    expect(s.notify).toEqual({ ...NOTIFY_DEFAULTS, photoIn: false })
    expect(Object.keys(s.perms)).toEqual(['m1'])
    expect(s.perms.m1!.printSheet).toBe(false)
    expect(s.acks).toEqual({ slow: { signature: 'B01', by: 'พี่บี', at: '08:10' } })
  })

  it('round-trips: the switches at the top, perms and acks beside them', () => {
    const s = settingsFromJson({ morningSheet: true, perms: { m1: DEFAULTS.manager }, acks: {} })
    const json = settingsToJson(s)
    expect(json).toMatchObject({ morningSheet: true, perms: { m1: DEFAULTS.manager }, acks: {} })
    expect(settingsFromJson(json)).toEqual(s)
  })
})

describe('permsOf', () => {
  it('the owner always has everything; a worker never a size key', () => {
    const s = settingsFromJson({ perms: { m1: { ...DEFAULTS.owner } } })
    expect(permsOf(s, member('owner'))).toEqual(DEFAULTS.owner)
    expect(permsOf(s, member('worker'))).toEqual({ ...DEFAULTS.worker, remindMissing: true })
  })

  it('a person with nothing stored has the role’s defaults', () => {
    expect(permsOf(settingsFromJson({}), member('manager', 'm9'))).toEqual(DEFAULTS.manager)
  })
})
