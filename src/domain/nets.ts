/**
 * The farm's ยอ, ported from the mock store (liff-app/dev-mock/store.ts
 * netView and netFor). The farm ยอ is the oldest live one: prod's farm_nets
 * has no default column and no shape, so every ยอ here is round.
 */

import type { Net } from '../contract/types.js'
import { TH } from '../copy/th.js'
import type { MemberRow, NetRow, PondRow } from '../data/types.js'
import { bangkokDay } from './farm.js'
import { fmtDay, pondRange } from './format.js'
import { personName } from './names.js'

/** `farm_nets.name`. One live ยอ per name (`farm_nets_one_live_name`), so one per size. */
export function netName(cm: number): string {
  return `ยอ ${cm} ซม.`
}

/** `nets` live, oldest first: the pond's own ยอ while it is live, else the farm ยอ, else none. */
export function pondNet(nets: NetRow[], pond: Pick<PondRow, 'netId'>): NetRow | null {
  return nets.find((n) => n.id === pond.netId) ?? nets[0] ?? null
}

/** `nets` are the farm's live ยอ, oldest first; `members` its active people. */
export function netView(net: NetRow, nets: NetRow[], ponds: PondRow[], members: MemberRow[]): Net {
  const isFarmDefault = nets[0]?.id === net.id
  const uses = ponds.filter((p) => pondNet(nets, p)?.id === net.id)
  const name = personName(members, net.createdBy)
  const addedOn = bangkokDay(new Date(net.createdAt))
  return {
    id: net.id,
    shape: 'round',
    cm: net.cm,
    use: isFarmDefault ? TH.farmNet : uses.length ? pondRange(uses.map((p) => p.code).sort()) : TH.netNoPonds,
    pondCount: uses.length,
    addedBy: `${name}${TH.netAddedBy} ${fmtDay(addedOn)}`,
    addedOn,
    isFarmDefault,
  }
}
