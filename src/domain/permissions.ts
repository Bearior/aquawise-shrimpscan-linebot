/**
 * What a person may do beyond the daily scan, ported from the mock store
 * (liff-app/dev-mock/store.ts DEFAULTS and effective()).
 */

import type { PermissionKey, Permissions, Role } from '../contract/types.js'

export const DEFAULTS: Record<Role, Permissions> = {
  owner: { editOthers: true, measureInbox: true, farmOverview: true, printSheet: true, remindMissing: true },
  manager: { editOthers: true, measureInbox: true, farmOverview: true, printSheet: true, remindMissing: false },
  worker: { editOthers: false, measureInbox: false, farmOverview: false, printSheet: false, remindMissing: true },
}

/** The keys that would show a size or a result. A worker never has them, whatever is stored. */
export const SIZE_KEYS: readonly PermissionKey[] = ['editOthers', 'measureInbox', 'farmOverview', 'printSheet']

export function effective(role: Role, stored: Permissions = DEFAULTS[role]): Permissions {
  const p = { ...stored }
  if (role === 'worker') for (const k of SIZE_KEYS) p[k] = false
  return p
}
