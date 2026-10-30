import type { Role } from '@/api/types'
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

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`rb ${ROLE_CLASS[role]}`}>{ROLE_LABEL[role]}</span>
}

/** '7K2P9QX' as '7K2P 9QX', easier to read out and type. */
export function spacedCode(code: string): string {
  return code.length > 4 ? `${code.slice(0, 4)} ${code.slice(4)}` : code
}
