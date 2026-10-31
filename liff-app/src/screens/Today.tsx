import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { Band } from '@/components/band'
import { Page } from '@/components/Page'
import { Btn, ErrorState, Head3, Saved, Skeleton, Tip } from '@/components/ui'
import { fmtTime, fmtWeekday } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession } from '@/session'

/**
 * บ่อที่ต้องสแกนวันนี้ (W23): the ponds this person looks after, scanned today
 * or not. No sizes here: a worker scans each pond into the pond, and the
 * owner sees what it said. While the worker sees their ponds (seePonds,
 * Bear 2026-10-31) a scanned pond opens its หน้าบ่อ, and บ่อที่ดูแล is the
 * second tab.
 */
export default function Today() {
  const navigate = useNavigate()
  const { session } = useSession()
  const r = useApi(() => api.today())
  const owner = session.farm!.ownerName
  const sees = session.permissions.seePonds
  const nav = sees ? ('today' as const) : undefined
  const band = <Band art="yor" title="บ่อที่ต้องสแกนวันนี้" sub={`${session.user.name} · ${fmtWeekday(session.today)}`} userName={session.user.name} />

  if (!r.data) {
    return (
      <Page top={null} nav={nav}>
        {band}
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[60, 220, 120]} />}
      </Page>
    )
  }
  const d = r.data
  const left = d.rows.filter((x) => !x.scanId)
  const done = d.rows.filter((x) => x.scanId)
  const pct = d.total ? (d.done / d.total) * 100 : 0

  return (
    <Page
      top={null}
      nav={nav}
      foot={
        left.length ? (
          <Btn icon="scan" onClick={() => navigate(P.scan(left[0]!.pondId))}>
            สแกนบ่อ {left[0]!.pondCode}
          </Btn>
        ) : undefined
      }
    >
      {band}
      <div className="vc xprog">
        <div className="pl">
          <span>สแกนแล้ว</span>
          <b>
            {d.done}/{d.total}
          </b>
        </div>
        <div className="pt">
          <i style={{ width: `${pct.toFixed(1)}%` }} />
        </div>
      </div>
      {!d.total ? (
        <Tip>ยังไม่มีบ่อที่ต้องสแกนค่ะ ให้{owner}เลือกบ่อให้ก่อนนะคะ</Tip>
      ) : !left.length ? (
        <Saved>
          สแกนครบ {d.total} บ่อแล้วค่ะ ผลถึง{owner}แล้ว พรุ่งนี้สแกนใหม่นะคะ
        </Saved>
      ) : (
        <div className="grp">
          <Head3 t={`ยังไม่สแกน ${left.length} บ่อ`} d="กดบ่อที่จะสแกนได้เลย" />
          <div className="pg" role="list" aria-label="บ่อที่ยังไม่สแกน">
            {left.map((x) => (
              <button key={x.pondId} type="button" role="listitem" className="pd m" onClick={() => navigate(P.scan(x.pondId))}>
                <b>{x.pondCode}</b>
                ยังไม่สแกน
              </button>
            ))}
          </div>
        </div>
      )}
      {done.length ? (
        <div className="grp">
          <Head3 t={`สแกนแล้ว ${done.length} บ่อ`} />
          <div className="pg" role="list" aria-label="บ่อที่สแกนแล้ว">
            {done.map((x) => {
              const said = x.by && x.by !== session.user.name ? `${x.by}สแกน` : x.at ? fmtTime(x.at) : 'สแกนแล้ว'
              return sees ? (
                <button key={x.pondId} type="button" role="listitem" className="pd g" onClick={() => navigate(P.pond(x.pondId))} aria-label={`บ่อ ${x.pondCode} ${said} · ดูหน้าบ่อ`}>
                  <b>{x.pondCode}</b>
                  {said}
                </button>
              ) : (
                <div key={x.pondId} role="listitem" className="pd g">
                  <b>{x.pondCode}</b>
                  {said}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
      <Tip plain>กดบันทึกแล้ว ผลสแกนถึง{owner}ทันที ไม่ต้องส่งรูปในแชทค่ะ</Tip>
    </Page>
  )
}
