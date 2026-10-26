import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { Page } from '@/components/Page'
import { Btn, ErrorState, MBtn, OkRow, Skeleton, WarnRow } from '@/components/ui'
import { fmt1, fmtTime, fmtWeekday, pondRange } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession } from '@/session'

/** The rows listed in full; quiet, normal ones beyond these fold into one line. */
const SHOW = 4

/** บ่อที่ดูแลวันนี้ (W23): today's result for every pond the person looks after. */
export default function Today() {
  const navigate = useNavigate()
  const { session } = useSession()
  const r = useApi(() => api.today())
  const sub = `${session.user.name} · ${fmtWeekday(session.today)}`

  if (!r.data) {
    return (
      <Page title="บ่อที่ดูแลวันนี้" sub={sub} close>
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[40, 320]} />}
      </Page>
    )
  }
  const d = r.data
  const done = d.rows.filter((x) => x.scanId)
  const sent = d.rows.filter((x) => !x.scanId && x.waiting)
  const missing = d.rows.filter((x) => !x.scanId && !x.waiting)
  // Rows that need a look come first; quiet ones fold away after SHOW.
  const loud = done.filter((x) => x.lighter)
  const quiet = done.filter((x) => !x.lighter)
  const listed = [...loud, ...quiet.slice(0, Math.max(0, SHOW - loud.length))]
  const folded = quiet.slice(Math.max(0, SHOW - loud.length))

  return (
    <Page
      title="บ่อที่ดูแลวันนี้"
      sub={sub}
      close
      foot={
        missing.length && session.permissions.scanSelf ? (
          <Btn icon="scan" onClick={() => navigate(P.scan(missing[0]!.pondId))}>
            สแกนบ่อ {missing[0]!.pondCode}
          </Btn>
        ) : undefined
      }
    >
      <b className="l2">
        สแกนแล้ว {d.done} จาก {d.total}
      </b>
      {listed.length ? (
        <div className="vc">
          {listed.map((x) => (
            <div className="hsr" key={x.pondId}>
              <span className="thm photo" style={x.photoUrl ? { backgroundImage: `url(${x.photoUrl})` } : undefined} />
              <div>
                <b>
                  {x.pondCode} · {x.perKg} ตัว/กก.
                </b>
                <span>
                  {x.abw !== null ? `${fmt1(x.abw)} ก.` : ''} · {x.by}
                  {x.by === session.user.name ? '' : 'วัด'} {x.at ? fmtTime(x.at) : ''}
                </span>
                {x.lighter ? <WarnRow>เบากว่ารอบก่อน</WarnRow> : <OkRow>ปกติ</OkRow>}
                {x.canFix && x.scanId ? (
                  <MBtn icon="redo" onClick={() => navigate(P.fix(x.scanId!))}>
                    แก้ขอบยอ
                  </MBtn>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {folded.length ? <span className="l5 mut">{pondRange(folded.map((x) => x.pondCode).sort())} ปกติทุกบ่อ</span> : null}
      {sent.length ? (
        <div className="vc">
          <b className="l3">
            ส่งรูปให้{session.farm!.ownerName}วัดแล้ว {sent.length} บ่อ
          </b>
          <span className="l5 mut">{sent.map((x) => x.pondCode).join(' · ')}</span>
        </div>
      ) : null}
      {missing.length ? (
        <div className="vc">
          <b className="l3">ยังไม่สแกน {missing.length} บ่อ</b>
          <span className="l5 mut">{missing.map((x) => x.pondCode).join(' · ')}</span>
        </div>
      ) : null}
    </Page>
  )
}
