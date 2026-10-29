import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { PondDetail } from '@/api/types'
import { Page } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { Btn, ErrorState, MBtn, Skeleton } from '@/components/ui'
import { DistBody } from '@/components/result'
import { GrowthChart } from '@/components/charts'
import { AskAgainSheet } from '@/components/ask-again'
import { PondPickerSheet } from '@/components/pond-picker'
import { addDays, dayOfMonth, fmt1, fmtDay, fmtDayYear, fmtInt, fmtTime, fmtTonnes, fmtWeekdayShort, fmtWhen, monthShort } from '@/lib/format'
import { gramsAt } from '@/lib/sizes'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession, useToast } from '@/session'

function Banner({ d, target }: { d: PondDetail; target: number }) {
  const p = d.pond
  if (p.status === 'missing') {
    return (
      <div className="xban u">
        <b>วันนี้ยังไม่ได้สแกน</b>
        <span>{p.caretaker ? `${p.caretaker}ยังไม่ได้สแกนบ่อนี้วันนี้` : 'บ่อนี้ยังไม่มีคนดูแล วันนี้ยังไม่มีใครสแกน'}</span>
      </div>
    )
  }
  if (p.status === 'urgent' || p.status === 'watch') {
    return (
      <div className={`xban ${p.status === 'urgent' ? 'u' : 'w'}`}>
        <b>{p.status === 'urgent' ? 'ต้องดู' : 'เฝ้าระวัง'}</b>
        <span>{p.issue ?? 'ไซส์เริ่มไม่เสมอ'}</span>
      </div>
    )
  }
  if (p.daysToTarget === null || !p.reachOn) {
    return (
      <div className="xban g">
        <b>ยังบอกวันถึงไซส์ไม่ได้</b>
        <span>สแกนอีกสักรอบ น้ำจะคิดวันให้ค่ะ</span>
      </div>
    )
  }
  const a = addDays(p.reachOn, -1)
  const b = addDays(p.reachOn, 1)
  const range = monthShort(a) === monthShort(b) ? `${dayOfMonth(a)} ถึง ${fmtDay(b)}` : `${fmtDay(a)} ถึง ${fmtDay(b)}`
  const head = p.daysToTarget <= 0 ? `ถึงไซส์ ${target} แล้ว` : p.status === 'ready' ? `พร้อมจับ อีกราว ${p.daysToTarget} วัน` : `โตดี อีกราว ${p.daysToTarget} วัน`
  return (
    <div className={`xban${p.status === 'ready' ? '' : ' g'}`}>
      <b>{head}</b>
      <span>
        ถึงไซส์ {target} ราว {fmtWeekdayShort(p.reachOn)} (ช่วง {range})
      </span>
    </div>
  )
}

/** หน้าบ่อ (O23): what to do with the pond first, then the answer (ready in N days), the numbers, the sizes, growth, tonnes, the last scan. */
export default function Pond() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { session } = useSession()
  const toast = useToast()
  const r = useApi(() => api.pond(id), [id])
  const all = useApi(() => api.ponds(), [])
  const [ask, setAsk] = useState(false)
  const [picking, setPicking] = useState(false)
  const farm = session.farm!

  if (!r.data) {
    return (
      <Page title="บ่อ" back={P.ponds}>
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[48, 80, 90, 120, 300]} />}
      </Page>
    )
  }
  const d = r.data
  const p = d.pond
  const target = farm.targetPerKg
  const targetG = gramsAt(target)
  const left = p.abw !== null ? Math.max(0, targetG - p.abw) : null
  const st = d.stocking
  const who = [p.caretaker, `โซน ${p.zone}`, p.ageDays !== null ? `เลี้ยง ${p.ageDays} วัน` : null].filter(Boolean).join(' · ')
  const canPrint = session.permissions.printSheet && Boolean(d.latest)
  const hasBand = d.growth.length >= 2 && d.growth.some((g) => g.sd != null)

  return (
    <Page
      title={
        <button type="button" className="ppick" aria-haspopup="dialog" aria-expanded={picking} aria-label={`บ่อ ${p.code} · เลือกบ่ออื่น`} onClick={() => setPicking(true)}>
          บ่อ {p.code}
          <Icon n="down" />
        </button>
      }
      back={P.ponds}
      over={
        picking ? (
          <PondPickerSheet
            data={all.data ?? null}
            error={all.error}
            onRetry={all.reload}
            currentId={p.id}
            onCancel={() => setPicking(false)}
            onPick={(next) => {
              setPicking(false)
              navigate(P.pond(next), { replace: true })
            }}
          />
        ) : ask && d.latest ? (
          <AskAgainSheet
            scanId={d.latest.scanId}
            pondCode={p.code}
            sender={p.caretaker ?? 'คนที่ส่ง'}
            ownerName={farm.ownerName}
            initial="other"
            onCancel={() => setAsk(false)}
            onDone={() => {
              setAsk(false)
              toast.show(`ขอรูปบ่อ ${p.code} ใหม่แล้ว`)
            }}
          />
        ) : null
      }
    >
      <div style={{ display: 'grid', gap: 2 }}>
        <b className="l1">บ่อ {p.code}</b>
        <span className="l5 mut">{who}</span>
      </div>
      <div className="pact">
        <Btn kind="s" icon="scan" className={canPrint ? undefined : 'w'} onClick={() => navigate(P.scan(p.id))}>
          สแกนบ่อนี้
        </Btn>
        {canPrint ? (
          <Btn kind="s" icon="print" onClick={() => navigate(P.printPond(p.id))}>
            พิมพ์ใบผล
          </Btn>
        ) : null}
        {d.latest && p.caretaker ? (
          <Btn kind="l" className="w" onClick={() => setAsk(true)}>
            ขอรูปใหม่จาก{p.caretaker}
          </Btn>
        ) : null}
      </div>
      <Banner d={d} target={target} />
      {p.perKg !== null && p.abw !== null ? (
        <div className="xst">
          <div>
            <b>{p.perKg}</b>
            <span>ตัวต่อกิโล</span>
          </div>
          <div>
            <b>{fmt1(p.abw)}</b>
            <span>กรัมต่อตัว</span>
          </div>
          {p.gPerDay !== null ? (
            <div className="w2">
              <b>
                {p.gPerDay >= 0 ? '+' : ''}
                {p.gPerDay.toFixed(2)}
              </b>
              <span>กรัมต่อวัน</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {d.note ? (
        <div className="pnote">
          <Icon n="msg" />
          <span>
            <b>
              {d.note.by}จดไว้ {fmtTime(d.note.at)}
            </b>
            <br />
            {d.note.text}
          </span>
        </div>
      ) : null}
      {d.latestShrimpGrams.length ? <DistBody grams={d.latestShrimpGrams} target={target} /> : null}
      <div className="vc">
        <b className="l3">{p.gPerDay !== null ? `กุ้งโตวันละ ${p.gPerDay.toFixed(2)} กรัม` : 'น้ำหนักกุ้งในบ่อนี้'}</b>
        <span className="l5 mut">
          เส้นประเขียว คือไซส์ {target} ({fmt1(targetG).replace(/\.0$/, '')} กรัม)
        </span>
        {hasBand ? <span className="l5 mut">แถบฟ้า คือช่วงน้ำหนักกุ้งส่วนใหญ่ (± SD)</span> : null}
        <GrowthChart points={d.growth} targetPerKg={target} w={300} h={190} gPerDay={p.gPerDay} band />
        <div className="pst2">
          <div>
            <span>ต้องโตอีก</span>
            <b>{left === null ? 'ยังไม่รู้' : left <= 0 ? 'ถึงแล้ว' : `${fmt1(left)} กรัม`}</b>
          </div>
          <div>
            <span>โอกาสถึงตามกำหนด</span>
            <b>{d.onTimeChance === null ? 'ยังไม่รู้' : `ราว ${Math.round(d.onTimeChance * 100)}%`}</b>
          </div>
        </div>
      </div>
      <div className="vc">
        {d.tonnesNow !== null && st.count && st.stockedOn ? (
          <>
            <b className="l3">กุ้งในบ่อราว {fmtTonnes(d.tonnesNow)} ตัน</b>
            <span className="l5 mut">
              ลง {fmtInt(st.count)} ตัว {fmtDay(st.stockedOn)}
              {st.survival !== null ? ` · คิดว่ารอด ${Math.round(st.survival * 100)}%` : ''}
            </span>
            <Btn kind="l" onClick={() => navigate(P.stocking(p.id))}>
              แก้ข้อมูลลงกุ้ง
            </Btn>
          </>
        ) : (
          <>
            <b className="l3">ยังไม่รู้ว่ากุ้งในบ่อกี่ตัน</b>
            <span className="l5 mut">ใส่วันลงกุ้งกับจำนวนครั้งเดียว น้ำคิดให้ค่ะ</span>
            <Btn kind="l" onClick={() => navigate(P.stocking(p.id))}>
              ใส่ข้อมูลลงกุ้ง
            </Btn>
          </>
        )}
      </div>
      {d.latest ? (
        <div className="vc">
          <div className="lscan">
            <span className="thm photo" style={{ backgroundImage: `url(${d.latest.photoUrl})` }} />
            <div>
              <b className="l3">สแกนล่าสุด {fmtWhen(d.latest.at, session.today)}</b>
              <span className="l5 mut">
                {d.latest.photoBy === d.latest.measuredBy ? `${d.latest.photoBy}สแกน` : `${d.latest.photoBy}ถ่าย · ${d.latest.measuredBy}วัด`}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {d.latest.canFix ? (
              <MBtn icon="redo" onClick={() => navigate(P.fix(d.latest!.scanId))}>
                แก้ขอบยอ
              </MBtn>
            ) : null}
            <MBtn icon="list" onClick={() => navigate(P.history(p.id))}>
              ดูทุกครั้งที่สแกน
            </MBtn>
          </div>
        </div>
      ) : (
        <div className="vc soft l5">บ่อนี้ยังไม่มีผลสแกน · ล่าสุด {fmtDayYear(session.today)}</div>
      )}
    </Page>
  )
}
