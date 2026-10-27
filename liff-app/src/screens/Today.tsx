import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { Page } from '@/components/Page'
import { Btn, ErrorState, Head3, Saved, Skeleton, Tip } from '@/components/ui'
import { fmtTime, fmtWeekday } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession } from '@/session'

/**
 * บ่อที่ต้องสแกนวันนี้ (W23): the ponds this person looks after, scanned today
 * or not. No sizes and no results: a worker scans each pond into the pond,
 * and the owner sees what it said.
 */
export default function Today() {
  const navigate = useNavigate()
  const { session } = useSession()
  const r = useApi(() => api.today())
  const owner = session.farm!.ownerName
  const sub = `${session.user.name} · ${fmtWeekday(session.today)}`

  if (!r.data) {
    return (
      <Page title="บ่อที่ต้องสแกนวันนี้" sub={sub} close>
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
      title="บ่อที่ต้องสแกนวันนี้"
      sub={sub}
      close
      foot={
        left.length ? (
          <Btn icon="scan" onClick={() => navigate(P.scan(left[0]!.pondId))}>
            สแกนบ่อ {left[0]!.pondCode}
          </Btn>
        ) : undefined
      }
    >
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
            {done.map((x) => (
              <div key={x.pondId} role="listitem" className="pd g">
                <b>{x.pondCode}</b>
                {x.by && x.by !== session.user.name ? `${x.by}สแกน` : x.at ? fmtTime(x.at) : 'สแกนแล้ว'}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <Tip plain>กดบันทึกแล้ว ผลสแกนถึง{owner}ทันที ไม่ต้องส่งรูปในแชทค่ะ</Tip>
    </Page>
  )
}
