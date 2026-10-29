import { TH } from '../copy/th.js'
import type { MemberRow } from '../data/types.js'

/** The farm's name for a person: their LINE name, else เจ้าของฟาร์ม for the owner, else คนในฟาร์ม. */
export function personName(members: MemberRow[], lineUserId: string | null): string {
  const who = members.find((m) => m.lineUserId === lineUserId)
  return who?.name || (who?.role === 'owner' ? TH.ownerFallback : TH.someone)
}
