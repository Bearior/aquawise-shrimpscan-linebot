import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { TeamPerson } from '@/api/types'
import { Page } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { Ava } from '@/components/avatar'
import { Band } from '@/components/band'
import { ScanGrid } from '@/components/scan-grid'
import { ErrorState, MBtn, Skeleton, Tip } from '@/components/ui'
import { ROLE_LABEL, WORKER } from '@/copy/th'
import { fmtTime, fmtWeekday } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession } from '@/session'

/** Every pond a person looks after: scanned ones with the time (or who scanned for them), the rest red. */
function Squares({ x, onPond }: { x: TeamPerson; onPond: (id: string) => void }) {
  return (
    <div className="tm-sq" role="list" aria-label={`บ่อที่${x.name}ดูแล`}>
      {x.ponds.map((p) =>
        p.at ? (
          <button key={p.pondId} type="button" role="listitem" className="d" onClick={() => onPond(p.pondId)} aria-label={`${p.pondCode} สแกนแล้ว ${fmtTime(p.at)}`}>
            <span className="mono">{p.pondCode}</span>
            <small>{p.by && p.by !== x.name ? p.by : fmtTime(p.at)}</small>
          </button>
        ) : (
          <button key={p.pondId} type="button" role="listitem" className="x" onClick={() => onPond(p.pondId)} aria-label={`${p.pondCode} ยังไม่สแกน`}>
            <Icon n="cam" />
            <span className="mono">{p.pondCode}</span>
          </button>
        ),
      )}
    </div>
  )
}

/**
 * ใครสแกนแล้ววันนี้ (O39). The head is แบบ A of the redesign
 * (docs/shrimpscan-ponds-team-redesign) with the ring swapped for the farm's
 * last 13 weeks (Bear: like GitHub's activity, line-bot's graph). Under it,
 * แบบ B: a card for each person with ponds left, the missing ponds as big
 * red buttons straight to the pond; the people who finished as short green
 * rows that open to their ponds.
 */
export default function TeamToday() {
  const navigate = useNavigate()
  const { session } = useSession()
  const r = useApi(() => api.teamToday())
  const [open, setOpen] = useState<Set<string>>(new Set())
  const owner = session.role === 'owner'
  const band = (
    <Band art="camera" title="สแกนวันนี้" sub={fmtWeekday(session.today)} userName={session.user.name} onProfile={() => navigate(P.settings)} />
  )

  if (!r.data) {
    return (
      <Page top={null} nav="team">
        {band}
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[230, 150, 150, 64]} />}
      </Page>
    )
  }
  const d = r.data
  const behind = d.people.filter((x) => x.done < x.total)
  const finished = d.people.filter((x) => x.done === x.total)
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const toPond = (id: string) => navigate(P.pond(id))
  const change = (x: TeamPerson) =>
    owner ? (
      <MBtn icon="swap" onClick={() => navigate(`${P.memberPonds(x.memberId)}?from=team`)}>
        เปลี่ยนบ่อที่ดูแล
      </MBtn>
    ) : null

  return (
    <Page top={null} nav="team">
      {band}
      <section className="tm-head" aria-label="สแกนแล้วทั้งฟาร์ม">
        <div className="tm-top">
          <div className="tm-t">
            <b>สแกนแล้วทั้งฟาร์ม</b>
            <span>{behind.length ? `ยังไม่ครบ ${behind.length} คน` : d.done >= d.total ? 'ครบทุกบ่อแล้ว' : `ยังไม่สแกน ${d.total - d.done} บ่อ`}</span>
          </div>
          <b className="tm-n mono">
            {d.done}
            <small>/{d.total}</small>
          </b>
        </div>
        {d.remindAt && behind.length ? (
          <span className="tm-bell">
            <Icon n="bell" />
            {d.remindAt} น้ำจะเตือนคนที่ยังขาดให้ค่ะ
          </span>
        ) : null}
        <ScanGrid history={d.history} total={d.total} today={d.today} />
      </section>

      {behind.map((x) => {
        const miss = x.ponds.filter((p) => !p.at)
        const isOpen = open.has(x.memberId)
        return (
          <div className="tm-pc" key={x.memberId}>
            <div className="tm-pch">
              <Ava name={x.name} size={52} src={x.pictureUrl} />
              <div className="tx">
                <b>{x.name}</b>
                <span>
                  {ROLE_LABEL[x.role]} · {x.pondsLabel}
                  {x.lastAt ? ` · ล่าสุด ${fmtTime(x.lastAt)}` : ' · ยังไม่เริ่ม'}
                </span>
              </div>
              <b className="n mono">
                {x.done}
                <small>/{x.total}</small>
              </b>
            </div>
            <div className="tm-miss">
              <span>ยังไม่สแกน {miss.length} บ่อ</span>
              {miss.map((p) => (
                <button key={p.pondId} type="button" className="tm-chip" onClick={() => toPond(p.pondId)}>
                  <Icon n="cam" />
                  {p.pondCode}
                </button>
              ))}
            </div>
            <button type="button" className="tm-lnk" aria-expanded={isOpen} onClick={() => toggle(x.memberId)}>
              {isOpen ? 'ซ่อนบ่อ' : 'ดูทุกบ่อ'}
              <Icon n={isOpen ? 'up' : 'down'} />
            </button>
            {isOpen ? (
              <div className="tm-more w-fade">
                <Squares x={x} onPond={toPond} />
                {change(x)}
              </div>
            ) : null}
          </div>
        )
      })}

      {finished.length ? (
        <>
          <h3 className="tm-sec">สแกนครบแล้ว</h3>
          <div className="tm-fin">
            {finished.map((x) => {
              const isOpen = open.has(x.memberId)
              return (
                <div className="tm-fr" key={x.memberId}>
                  <button type="button" aria-expanded={isOpen} onClick={() => toggle(x.memberId)}>
                    <span className="ck">
                      <Icon n="check" />
                    </span>
                    <span className="tx">
                      <b>{x.name}</b>
                      <span className="mono">
                        {x.done}/{x.total}
                      </span>
                      {x.lastAt ? <em>เสร็จ {fmtTime(x.lastAt)}</em> : null}
                    </span>
                    <Icon n="chev" className={isOpen ? 'turn' : undefined} />
                  </button>
                  {isOpen ? (
                    <div className="tm-more w-fade">
                      <Squares x={x} onPond={toPond} />
                      {change(x)}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </>
      ) : null}

      {d.nobody.length ? (
        <div className="tm-pc">
          <b className="tm-nb">ยังไม่มีคนดูแล {d.nobody.length} บ่อ</b>
          <span className="tm-nbs">{d.nobody.map((p) => p.pondCode).join(' ')}</span>
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
