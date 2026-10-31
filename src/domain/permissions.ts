/**
 * What a person may do beyond the daily scan, ported from the mock store
 * (liff-app/dev-mock/store.ts DEFAULTS and effective()).
 */

import type { PermissionKey, Permissions, Role } from '../contract/types.js'

export const DEFAULTS: Record<Role, Permissions> = {
  owner: { editOthers: true, measureInbox: true, farmOverview: true, printSheet: true, seePonds: true, remindMissing: true },
  manager: { editOthers: true, measureInbox: true, farmOverview: true, printSheet: true, seePonds: true, remindMissing: false },
  worker: { editOthers: false, measureInbox: false, farmOverview: false, printSheet: false, seePonds: true, remindMissing: true },
}

/** The farm-wide keys: other people's photos and results, the whole farm, the sheets. A worker never has them, whatever is stored. */
export const SIZE_KEYS: readonly PermissionKey[] = ['editOthers', 'measureInbox', 'farmOverview', 'printSheet']

export function effective(role: Role, stored: Permissions = DEFAULTS[role]): Permissions {
  const p = { ...stored }
  if (role === 'worker') for (const k of SIZE_KEYS) p[k] = false
  return p
}

/** Whether `me` reads pond numbers at all: an owner and a manager always, a worker (their own ponds only) while seePonds is on. */
export function seesPonds(me: { role: Role; perms?: Permissions }): boolean {
  return me.role !== 'worker' || (me.perms ?? effective(me.role)).seePonds
}
