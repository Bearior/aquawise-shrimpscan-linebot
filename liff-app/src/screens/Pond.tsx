import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { PondDetail } from '@/api/types'
import { Page } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { Btn, ErrorState, MBtn, Skeleton } from '@/components/ui'
import { GrowthChart } from '@/components/charts'
import { AskAgainSheet } from '@/components/ask-again'
import { PondPickerSheet } from '@/components/pond-picker'
import { addDays, dayOfMonth, fmt1, fmtDay, fmtDayYear, fmtInt, fmtTime, fmtTonnes, fmtWeekdayShort, fmtWhen, monthShort } from '@/lib/format'
import { DIST_COLOR, distSay, distribution, gramsAt } from '@/lib/sizes'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession, useToast } from '@/session'

/** The stripe at the top of the answer card: why the pond is red or yellow today. */
function Stripe({ d, worker }: { d: PondDetail; worker: boolean }) {
  const p = d.pond
  if (p.status === 'missing') {
    // The worker is the caretaker: their own name would read oddly, so the stripe says what to do.
    const who = worker ? 'กดสแกนบ่อนี้ด้านบนได้เลยค่ะ' : p.caretaker ? `${p.caretaker}ยังไม่ได้สแกนบ่อนี้วันนี้` : 'บ่อนี้ยังไม่มีคนดูแล วันนี้ยังไม่มีใครสแกน'
    return (
      <div className="pg-stripe bd">
        <Icon n="cam" />
        <span>
          <b>วันนี้ยังไม่ได้สแกน</b> · {who}
          {d.latest ? ' ตัวเลขด้านล่างมาจากครั้งก่อน' : ''}
        </span>
      </div>
    )
  }
  if (p.status === 'urgent' || p.status === 'watch') {
    return (
      <div className={`pg-stripe ${p.status === 'urgent' ? 'bd' : 'wn'}`}>
        <Icon n="warn" />
        <span>
          <b>{p.status === 'urgent' ? 'ต้องดู' : 'เฝ้าระวัง'}</b> · {p.issue ?? 'ไซส์เริ่มไม่เสมอ'}
        </span>
      </div>
    )
  }
  return null
}

/** The half ring: grams a shrimp now, against the grams the farm's size needs. */
function Gauge({ abw, targetG, ready }: { abw: number | null; targetG: number; ready: boolean }) {
  const frac = abw === null ? 0 : Math.min(1, abw / targetG)
  return (
    <div className="pg-gauge" role="img" aria-label={abw === null ? 'ยังไม่รู้น้ำหนัก' : `${fmt1(abw)} จาก ${fmt1(targetG)} กรัม`}>
      <svg viewBox="0 0 136 90">
        <path d="M12 80 A56 56 0 0 1 124 80" fill="none" stroke="#E0E0EA" strokeWidth="14" strokeLinecap="round" />
        {abw !== null ? (
          <path
            d="M12 80 A56 56 0 0 1 124 80"
            fill="none"
            stroke={ready ? '#00706F' : '#004AAD'}
            strokeWidth="14"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${(frac * 100).toFixed(1)} 100`}
          />
        ) : null}
      </svg>
      <div className="pg-gc">
        <b className="mono">{abw === null ? '-' : fmt1(abw)}</b>
        <span>จาก {fmt1(targetG).replace(/\.0$/, '')} ก.</span>
      </div>
    </div>
  )
}

/** The answer beside the gauge: how many days to the farm's size, and roughly when. */
function Answer({ d, target }: { d: PondDetail; target: number }) {
  const p = d.pond
  if (p.daysToTarget !== null && p.daysToTarget <= 0) {
    return (
      <div className="pg-gt">
        <span className="k">ถึงไซส์ {target}</span>
        <span className="big rd">แล้ว</span>
        <span className="when">จับได้ตั้งแต่วันนี้</span>
      </div>
    )
  }
  if (p.daysToTarget === null || !p.reachOn) {
    return (
      <div className="pg-gt">
        <span className="k">ถึงไซส์ {target} อีก</span>
        <span className="big">ยังไม่รู้</span>
        <span className="when">สแกนอีกสักรอบ น้ำจะคิดวันให้ค่ะ</span>
      </div>
    )
  }
  const a = addDays(p.reachOn, -1)
  const b = addDays(p.reachOn, 1)
  const range = monthShort(a) === monthShort(b) ? `${dayOfMonth(a)} ถึง ${fmtDay(b)}` : `${fmtDay(a)} ถึง ${fmtDay(b)}`
  const chance = d.onTimeChance
  return (
    <div className="pg-gt">
      <span className="k">{p.status === 'ready' ? `พร้อมจับ ถึงไซส์ ${target} อีก` : `ถึงไซส์ ${target} อีก`}</span>
      <span className={`big${p.status === 'ready' ? ' rd' : ''}`}>
        <span className="mono">{p.daysToTarget}</span> <small>วัน</small>
      </span>
      <span className="when">
        ราว {fmtWeekdayShort(p.reachOn)} (ช่วง {range})
      </span>
      {chance !== null ? (
        <span className={`pill ${chance >= 0.7 ? 'rd' : chance >= 0.5 ? 'wn' : 'bd'}`}>
          <Icon n="clock" />
          โอกาสทันกำหนด {Math.round(chance * 100)}%
        </span>
      ) : null}
    </div>
  )
}

/** ขนาดกุ้งในยอ as rows of bars, the biggest shrimp first; the row name is ตัวต่อกิโล. */
function Sizes({ grams, target }: { grams: number[]; target: number }) {
  const d = distribution(grams, target)
  const say = distSay(d, target)
  const max = Math.max(1, ...d.rows.map((r) => r.count))
  return (
    <div className="pg-card">
      <b className="h">ขนาดกุ้งในยอ</b>
      <span className="sub">
        นับ {d.n} ตัว · เล็กสุด {fmt1(d.min)} ก. ใหญ่สุด {fmt1(d.max)} ก. · ชื่อแถว คือ ตัวต่อกิโล
      </span>
      <div className="pg-hb">
        {d.rows.map((r) => (
          <div className="r" key={r.label}>
            <div className="l">
              <b>{r.label}</b>
              <span>{r.grams}</span>
            </div>
            <div className="bar">
              <i style={{ width: `${Math.max(4, Math.round((r.count / max) * 100))}%`, background: DIST_COLOR[r.kind] }} />
            </div>
            <div className="v">
              <b className="mono">{r.pct}%</b>
              <span>{r.count} ตัว</span>
            </div>
          </div>
        ))}
      </div>
      <p className="pg-say">
        {say.lead ? <b>{say.lead}</b> : null}
        {say.rest}
      </p>
    </div>
  )
}

/**
 * หน้าบ่อ (O23), แบบ A of the หน้าบ่อ redesign (docs/shrimpscan-ponds-team-redesign):
 * the pond picker in the header (‹ บ่อ A05 ⌄ ›), what to do first, then one
 * card that answers "when": a half ring of grams against the size, the days
 * left and the chance of making it. Then the three numbers, the sizes in the
 * ยอ, growth with its ± SD band, tonnes, and the last scan. A worker reads it
 * for their own ponds (seePonds, Bear 2026-10-31) without the tonnes, the
 * stocking or ขอรูปใหม่: the server sends them no stocking count.
 */
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
  const worker = session.role === 'worker'

  if (!r.data) {
    return (
      <Page title="บ่อ" back={P.ponds}>
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[52, 150, 90, 260, 300]} />}
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
  const go = (next: string) => navigate(P.pond(next), { replace: true })
  const reached = p.daysToTarget !== null && p.daysToTarget <= 0

  const head = (
    <div className="pg-h">
      <button type="button" className="pg-r" onClick={() => navigate(P.ponds)} aria-label="กลับไปรายบ่อ">
        <Icon n="larr" />
      </button>
      <div className="pg-pk">
        <button type="button" className="pg-r" disabled={!d.prevId} onClick={() => d.prevId && go(d.prevId)} aria-label={d.prevCode ? `บ่อก่อนหน้า ${d.prevCode}` : 'ไม่มีบ่อก่อนหน้า'}>
          <Icon n="back" />
        </button>
        <button type="button" className="pg-pill" aria-haspopup="dialog" aria-expanded={picking} aria-label={`บ่อ ${p.code} · เลือกบ่ออื่น`} onClick={() => setPicking(true)}>
          บ่อ {p.code}
          <Icon n="down" />
        </button>
        <button type="button" className="pg-r" disabled={!d.nextId} onClick={() => d.nextId && go(d.nextId)} aria-label={d.nextCode ? `บ่อถัดไป ${d.nextCode}` : 'ไม่มีบ่อถัดไป'}>
          <Icon n="chev" />
        </button>
      </div>
      <span />
      <span className="pg-who">{who}</span>
    </div>
  )

  return (
    <Page
      top={head}
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
              go(next)
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
      <div className={`pg-acts${canPrint ? '' : ' one'}`}>
        <button type="button" className="pg-bp" onClick={() => navigate(P.scan(p.id))}>
          <Icon n="scan" />
          สแกนบ่อนี้
        </button>
        {canPrint ? (
          <button type="button" className="pg-bs" onClick={() => navigate(P.printPond(p.id))}>
            <Icon n="print" />
            พิมพ์ใบผล
          </button>
        ) : null}
      </div>
      {d.latest && p.caretaker && !worker ? (
        <button type="button" className="pg-tl" onClick={() => setAsk(true)}>
          ขอรูปใหม่จาก{p.caretaker}
        </button>
      ) : null}

      <div className="pg-card">
        <Stripe d={d} worker={worker} />
        <div className="pg-hero">
          <Gauge abw={p.abw} targetG={targetG} ready={reached || p.status === 'ready'} />
          <Answer d={d} target={target} />
        </div>
      </div>

      {p.perKg !== null && p.abw !== null ? (
        <div className="pg-st3">
          <div>
            <b className="mono">{p.perKg}</b>
            <span>ตัวต่อกิโล</span>
          </div>
          <div>
            <b className="mono">{fmt1(p.abw)}</b>
            <span>กรัมต่อตัว</span>
          </div>
          {p.gPerDay !== null ? (
            <div>
              <b className={`mono${p.gPerDay >= 0 ? ' up' : ''}`}>
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

      {d.latestShrimpGrams.length ? <Sizes grams={d.latestShrimpGrams} target={target} /> : null}

      <div className="pg-card">
        <b className="h">
          {p.gPerDay !== null ? (
            <>
              กุ้งโตวันละ <span className="mono">{p.gPerDay.toFixed(2)}</span> กรัม
            </>
          ) : (
            'น้ำหนักกุ้งในบ่อนี้'
          )}
        </b>
        <span className="sub">
          {hasBand ? 'แถบฟ้า คือช่วงน้ำหนักกุ้งส่วนใหญ่ (± SD) · ' : ''}เส้นประเขียว คือไซส์ {target} ({fmt1(targetG).replace(/\.0$/, '')} กรัม)
        </span>
        <GrowthChart points={d.growth} targetPerKg={target} w={300} h={190} gPerDay={p.gPerDay} band />
        <div className="pg-kv2">
          <div>
            <span>ต้องโตอีก</span>
            <b>{left === null ? 'ยังไม่รู้' : left <= 0 ? 'ถึงแล้ว' : <><span className="mono">{fmt1(left)}</span> กรัม</>}</b>
          </div>
          <div>
            <span>ถึงไซส์ {target}</span>
            <b>{reached ? 'ถึงแล้ว' : p.reachOn ? fmtDay(p.reachOn) : 'ยังไม่รู้'}</b>
          </div>
        </div>
      </div>

      {worker ? null : (
        <div className="pg-card">
          {d.tonnesNow !== null && st.count && st.stockedOn ? (
            <>
              <b className="h">
                กุ้งในบ่อราว <span className="mono">{fmtTonnes(d.tonnesNow)}</span> ตัน
              </b>
              <span className="sub">
                ลง {fmtInt(st.count)} ตัว {fmtDay(st.stockedOn)}
                {st.survival !== null ? ` · คิดว่ารอด ${Math.round(st.survival * 100)}%` : ''}
              </span>
              <button type="button" className="pg-lnk" onClick={() => navigate(P.stocking(p.id))}>
                แก้ข้อมูลลงกุ้ง
                <Icon n="chev" />
              </button>
            </>
          ) : (
            <>
              <b className="h">ยังไม่รู้ว่ากุ้งในบ่อกี่ตัน</b>
              <span className="sub">ใส่วันลงกุ้งกับจำนวนครั้งเดียว น้ำคิดให้ค่ะ</span>
              <Btn kind="l" onClick={() => navigate(P.stocking(p.id))}>
                ใส่ข้อมูลลงกุ้ง
              </Btn>
            </>
          )}
        </div>
      )}

      {d.latest ? (
        <div className="pg-card">
          <div className="lscan">
            <span className="thm photo" style={{ backgroundImage: `url(${d.latest.photoUrl})` }} />
            <div>
              <b className="l3">สแกนล่าสุด {fmtWhen(d.latest.at, session.today)}</b>
              <span className="l5 mut">
                {d.latest.photoBy === d.latest.measuredBy ? `${d.latest.photoBy}สแกน` : `${d.latest.photoBy}ถ่าย · ${d.latest.measuredBy}วัด`}
                {d.latestShrimpGrams.length ? ` · นับได้ ${d.latestShrimpGrams.length} ตัว` : ''}
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
