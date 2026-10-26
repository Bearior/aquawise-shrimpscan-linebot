import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { ScanSummary } from '@/api/types'
import { Page } from '@/components/Page'
import { ErrorState, MBtn, Pill, Skeleton, Tip } from '@/components/ui'
import { WeightSpark } from '@/components/charts'
import { fmt1, fmtDay, fmtTime } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'

export function whoLine(s: Pick<ScanSummary, 'photoBy' | 'measuredBy' | 'at'>): string {
  return s.photoBy === s.measuredBy ? `${s.photoBy}สแกน ${fmtTime(s.at)}` : `${s.photoBy}ส่ง ${s.measuredBy}วัด`
}

/** ประวัติสแกน (E2, E6): every scan of one pond, the weight line, and แก้ขอบยอ on the rows that allow it. */
export default function History() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const r = useApi(() => api.pondScans(id), [id])

  if (!r.data) {
    return (
      <Page title="ประวัติสแกน" back={P.pond(id)}>
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[200, 260]} />}
      </Page>
    )
  }
  const { pond, scans } = r.data
  const line = [...scans].reverse().map((s) => ({ date: s.date, abw: s.abw }))
  const sub = [pond.caretaker, `โซน ${pond.zone}`, 'ประวัติสแกน'].filter(Boolean).join(' · ')

  return (
    <Page title={`บ่อ ${pond.code}`} sub={sub} back={P.pond(id)}>
      <div className="vc">
        <b className="l3">น้ำหนักเฉลี่ยทุกครั้งที่สแกน</b>
        <WeightSpark points={line} lighter={Boolean(scans[0]?.lighter)} />
      </div>
      {scans.length ? (
        <div className="vc">
          {scans.map((s) => (
            <div className="hsr" key={s.scanId}>
              <span className="thm photo" style={{ backgroundImage: `url(${s.photoUrl})` }} />
              <div>
                <b>
                  {fmtDay(s.date)} · {Math.round(s.perKg)} ตัว/กก.
                </b>
                <span>
                  {fmt1(s.abw)} ก. · {whoLine(s)}
                </span>
                {s.fixed ? (
                  <>
                    <Pill k="hr">แก้ขอบยอแล้ว</Pill>
                    <span className="l5 mut">
                      {s.fixed.by}แก้ {fmtTime(s.fixed.at)} · ผลเดิม {Math.round(s.fixed.oldPerKg)} ตัว/กก.
                    </span>
                  </>
                ) : s.lighter ? (
                  <Pill k="bd">เบากว่ารอบก่อน</Pill>
                ) : null}
                {s.canFix ? (
                  <MBtn icon="redo" onClick={() => navigate(P.fix(s.scanId))}>
                    แก้ขอบยอ
                  </MBtn>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <span className="l5 mut">บ่อนี้ยังไม่มีผลสแกนค่ะ</span>
      )}
      <Tip plain>แก้ขอบยอแล้ว ผลเดิมยังเก็บในประวัติเสมอ</Tip>
    </Page>
  )
}
