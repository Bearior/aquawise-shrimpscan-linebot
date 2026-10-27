import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { TeamPerson } from '@/api/types'
import { Page } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { ErrorState, MBtn, Pill, Skeleton, Tip } from '@/components/ui'
import { ROLE_LABEL, WORKER } from '@/copy/th'
import { fmtTime, fmtWeekday } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession } from '@/session'

function status(x: TeamPerson) {
  if (x.done === x.total) return <Pill k="ok">ครบแล้ว</Pill>
  if (x.done === 0) return <Pill k="bd">ยังไม่เริ่ม</Pill>
  return <Pill k="wn">ขาด {x.total - x.done} บ่อ</Pill>
}

function when(x: TeamPerson): string {
  if (!x.lastAt) return 'วันนี้ยังไม่ได้สแกน'
  return x.done === x.total ? `เสร็จ ${fmtTime(x.lastAt)}` : `ล่าสุด ${fmtTime(x.lastAt)}`
}

/**
 * ใครสแกนแล้ววันนี้ (O39): every person who looks after ponds, against their
 * own ponds, the ones with ponds left first. A pond tile opens the pond.
 */
export default function TeamToday() {
  const navigate = useNavigate()
  const { session } = useSession()
  const r = useApi(() => api.teamToday())
  const [open, setOpen] = useState<string | null>(null)
  const owner = session.role === 'owner'
  const sub = fmtWeekday(session.today)

  if (!r.data) {
    return (
      <Page title="สแกนวันนี้" sub={sub} nav="team">
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[60, 140, 140, 140]} />}
      </Page>
    )
  }
  const d = r.data
  const pct = d.total ? (d.done / d.total) * 100 : 0
  const behind = d.people.filter((x) => x.done < x.total).length

  return (
    <Page title="สแกนวันนี้" sub={sub} nav="team">
      <div className="vc xprog">
        <div className="pl">
          <span>สแกนแล้วทั้งฟาร์ม</span>
          <b>
            {d.done}/{d.total}
          </b>
        </div>
        <div className="pt">
          <i style={{ width: `${pct.toFixed(1)}%` }} />
        </div>
        <span className="l5 mut">
          {behind ? `ยังสแกนไม่ครบ ${behind} คน` : 'ทุกคนสแกนครบแล้ว'}
          {d.remindAt && behind ? ` · ${d.remindAt} น้ำเตือนคนที่ยังขาดให้ค่ะ` : ''}
        </span>
      </div>

      {d.people.map((x) => {
        const left = x.ponds.filter((p) => !p.at)
        const isOpen = open === x.memberId
        return (
          <div className="vc" key={x.memberId} style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ display: 'grid', gap: 2 }}>
                <b className="l2">{x.name}</b>
                <span className="l5 mut">
                  {ROLE_LABEL[x.role]} · ดูแล {x.pondsLabel} · {when(x)}
                </span>
              </div>
              {status(x)}
            </div>
            <div className="xprog">
              <div className="pl">
                <span>สแกนแล้ว</span>
                <b>
                  {x.done}/{x.total}
                </b>
              </div>
              <div className="pt">
                <i style={{ width: `${x.total ? ((x.done / x.total) * 100).toFixed(1) : 0}%` }} />
              </div>
              {left.length ? (
                <span className="miss">
                  <Icon n="warn" />
                  ยังไม่สแกน {left.map((p) => p.pondCode).join(' ')}
                </span>
              ) : null}
            </div>
            {isOpen ? (
              <div className="pg w-fade" role="list" aria-label={`บ่อที่${x.name}ดูแล`}>
                {x.ponds.map((p) => (
                  <button key={p.pondId} type="button" role="listitem" className={`pd ${p.at ? 'g' : 'm'}`} onClick={() => navigate(P.pond(p.pondId))}>
                    <b>{p.pondCode}</b>
                    {p.at ? (p.by && p.by !== x.name ? `${p.by}สแกน` : fmtTime(p.at)) : 'ยังไม่สแกน'}
                  </button>
                ))}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <MBtn icon={isOpen ? 'up' : 'grid'} onClick={() => setOpen(isOpen ? null : x.memberId)}>
                {isOpen ? 'ซ่อนบ่อ' : 'ดูทุกบ่อ'}
              </MBtn>
              {owner ? (
                <MBtn icon="list" onClick={() => navigate(`${P.memberPonds(x.memberId)}?from=team`)}>
                  เปลี่ยนบ่อที่ดูแล
                </MBtn>
              ) : null}
            </div>
          </div>
        )
      })}

      {d.nobody.length ? (
        <div className="vc" style={{ display: 'grid', gap: 8 }}>
          <b className="l3">ยังไม่มีคนดูแล {d.nobody.length} บ่อ</b>
          <span className="l5 mut">{d.nobody.map((p) => p.pondCode).join(' ')}</span>
          {owner ? (
            <MBtn icon="users" onClick={() => navigate(P.people)}>
              เลือกคนดูแลที่หน้าคนในฟาร์ม
            </MBtn>
          ) : null}
        </div>
      ) : null}

      {!d.people.length ? <Tip>ยังไม่มีใครดูแลบ่อค่ะ ชวน{WORKER}เข้าฟาร์มแล้วเลือกบ่อให้แต่ละคนนะคะ</Tip> : null}
    </Page>
  )
}
