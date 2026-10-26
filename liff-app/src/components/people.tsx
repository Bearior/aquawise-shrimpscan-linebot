import type { ReactNode } from 'react'
import type { Member, Role } from '@/api/types'
import { ROLE_LABEL } from '@/copy/th'
import { Icon } from './Icon'

const ROLE_CLASS: Record<Role, string> = { owner: 'o', manager: 'm', worker: 'w' }

/** The people pages' own header: back, title, a count on the right. */
export function PeopleHead({ title, count, onBack }: { title: string; count?: string; onBack: () => void }) {
  return (
    <div className="sph">
      <button type="button" className="bk" onClick={onBack} aria-label="กลับ">
        <Icon n="back" />
      </button>
      <b>{title}</b>
      {count ? <span className="cnt">{count}</span> : <span className="sp" />}
    </div>
  )
}

/** น้ำ's line at the top of a people page. */
export function NamBubble({ children }: { children: ReactNode }) {
  return (
    <div className="nbub">
      <span className="av av-nn" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`rb ${ROLE_CLASS[role]}`}>{ROLE_LABEL[role]}</span>
}

/** PersonRow: initial, name, role, scope, joined; the gear on every row but the owner's. */
export function PersonRow({ m, onGear }: { m: Member; onGear?: () => void }) {
  return (
    <div className="prow">
      <span className="pi" aria-hidden="true">
        {m.name.charAt(0)}
      </span>
      <div className="pt">
        <div className="pn">
          <b>{m.name}</b>
          <RoleBadge role={m.role} />
        </div>
        <span className="ps">{m.scope}</span>
        <span className="pj">{m.joined}</span>
      </div>
      {onGear ? (
        <button type="button" className="gb" onClick={onGear} aria-label={`แก้ไข ${m.name}`}>
          <Icon n="gear" />
        </button>
      ) : null}
    </div>
  )
}

/** '7K2P9QX' as '7K2P 9QX', easier to read out and type. */
export function spacedCode(code: string): string {
  return code.length > 4 ? `${code.slice(0, 4)} ${code.slice(4)}` : code
}
