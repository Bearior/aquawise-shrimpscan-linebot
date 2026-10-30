/**
 * The farm's settings as `shrimp_scan_farm_settings.notify` holds them, read
 * leniently: a key that is missing or not the right type is its default, so
 * an old or hand-edited row never breaks a screen.
 */

import type { NotifySettings, PermissionKey, Permissions } from '../contract/types.js'
import type { FarmSettings, MemberRow, StoredAck } from '../data/types.js'
import { DEFAULTS, effective } from './permissions.js'

/** The mock's new-farm switches (liff-app/dev-mock/store.ts). */
export const NOTIFY_DEFAULTS: NotifySettings = { photoIn: true, morningSummary: true, morningSheet: false, nearTarget: true, remindWorkers: true }

/** When น้ำ reminds the people with ponds left, while remindWorkers is on. */
export const REMIND_AT = '10:00'

const NOTIFY_KEYS = Object.keys(NOTIFY_DEFAULTS) as (keyof NotifySettings)[]
export const PERMISSION_KEYS = Object.keys(DEFAULTS.owner) as PermissionKey[]

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** A zone's name as people read it: one line, at most this long. */
export const ZONE_NAME_MAX = 30

/** The name worth keeping: trimmed, one line, never blank; null takes the name off. */
export function zoneNameOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/\s+/g, ' ').trim()
  return name && name.length <= ZONE_NAME_MAX ? name : null
}

function booleans<T extends object>(raw: unknown, base: T): T {
  const out = { ...base }
  if (!isObject(raw)) return out
  for (const k of Object.keys(base) as (keyof T)[]) {
    const v = raw[k as string]
    if (typeof v === 'boolean') out[k] = v as T[keyof T]
  }
  return out
}

export function settingsFromJson(raw: unknown): FarmSettings {
  const perms: Record<string, Permissions> = {}
  const acks: Record<string, StoredAck> = {}
  const zones: Record<string, string> = {}
  const top = isObject(raw) ? raw : {}
  if (isObject(top.perms)) {
    for (const [id, p] of Object.entries(top.perms)) if (isObject(p)) perms[id] = booleans(p, DEFAULTS.worker)
  }
  if (isObject(top.acks)) {
    for (const [key, a] of Object.entries(top.acks)) {
      if (isObject(a) && typeof a.signature === 'string' && typeof a.by === 'string' && typeof a.at === 'string') {
        acks[key] = { signature: a.signature, by: a.by, at: a.at }
      }
    }
  }
  if (isObject(top.zones)) {
    for (const [zone, n] of Object.entries(top.zones)) {
      const name = zoneNameOf(n)
      if (name) zones[zone] = name
    }
  }
  return { notify: booleans(top, NOTIFY_DEFAULTS), perms, acks, zones }
}

export function settingsToJson(s: FarmSettings): Record<string, unknown> {
  const notify = Object.fromEntries(NOTIFY_KEYS.map((k) => [k, s.notify[k]]))
  return { ...notify, perms: s.perms, acks: s.acks, zones: s.zones }
}

/** What this person may do: the owner's switches for them over their role's defaults, a worker's size keys held off. */
export function permsOf(settings: FarmSettings, me: MemberRow): Permissions {
  if (me.role === 'owner') return effective('owner')
  return effective(me.role, settings.perms[me.id] ?? DEFAULTS[me.role])
}
