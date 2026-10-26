import type { ReactNode } from 'react'
import type { NetShape, Pt, ScanResult } from '@/api/types'
import { fitRim, rimBox, rimPath } from '@/lib/rim'
import { BAND_COLOR, BAND_LABEL, bandCuts, bandOf, DIST_COLOR, distribution, distSay, isLighter, type Band } from '@/lib/sizes'
import { fmt1, fmtDay, fmtDayYear, bangkokDay } from '@/lib/format'
import { NET_SHAPE_LABEL } from '@/copy/th'
import { Icon } from './Icon'
import { Head2, Tip } from './ui'

const VW = 1000

/** The ยอ photo cut to the rim (the ring, or the 4-corner frame of a ยอสี่เหลี่ยม), with every shrimp dot. */
export function Crop({
  photoUrl,
  aspect,
  shape = 'round',
  rim,
  shrimp,
  width,
}: {
  photoUrl: string
  aspect: number
  shape?: NetShape
  rim: Pt[]
  shrimp: { x: number; y: number; band: Band }[]
  width: number
}) {
  const fit = fitRim(shape, rim)
  if (!fit) return null
  const box = rimBox(fit)
  const s = width / box.w
  const photoW = s
  const photoH = s / aspect
  const height = box.h * photoH
  const H = VW / aspect
  const vb = `${(box.x * VW).toFixed(1)} ${(box.y * H).toFixed(1)} ${(box.w * VW).toFixed(1)} ${(box.h * H).toFixed(1)}`
  const clip =
    fit.kind === 'quad'
      ? `polygon(${fit.q.map((p) => `${(((p.x - box.x) / box.w) * 100).toFixed(2)}% ${(((p.y - box.y) / box.h) * 100).toFixed(2)}%`).join(', ')})`
      : undefined
  return (
    <span
      className="crop"
      role="img"
      aria-label={`รูปยอเฉพาะใน${fit.kind === 'quad' ? 'กรอบ' : 'วง'} จุดสีคือกุ้งแต่ละตัวตามขนาด`}
      style={{
        width,
        height: Number(height.toFixed(1)),
        backgroundImage: `url(${photoUrl})`,
        backgroundSize: `${photoW.toFixed(1)}px ${photoH.toFixed(1)}px`,
        backgroundPosition: `${(-box.x * photoW).toFixed(1)}px ${(-box.y * photoH).toFixed(1)}px`,
        ...(clip ? { borderRadius: 0, clipPath: clip } : {}),
      }}
    >
      <svg viewBox={vb} aria-hidden="true">
        {shrimp.map((q, i) => (
          <circle key={i} cx={q.x * VW} cy={q.y * H} r={17} fill={BAND_COLOR[q.band]} stroke="#fff" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={rimPath(fit, VW, H)} fill="none" stroke="#FFD23F" strokeWidth={4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  )
}

/** ขนาดกุ้งในยอ by size class in ตัว/กก. */
export function DistBody({ grams, target, sub, extra }: { grams: number[]; target: number; sub?: string; extra?: string }) {
  const d = distribution(grams, target)
  const say = distSay(d, target)
  const max = Math.max(1, ...d.rows.map((r) => r.count))
  const kinds = new Set(d.rows.map((r) => r.kind))
  const legend: [keyof typeof DIST_COLOR, string][] = [
    ['t', `ถึงไซส์ ${target} แล้ว`],
    ['n', 'ใกล้ถึง'],
    ['s', `ยังเล็กกว่าไซส์ ${target}`],
  ]
  return (
    <div className="dist">
      <div className="dh">
        <b className="l3">ขนาดกุ้งในยอ</b>
        <span className="l5 mut">{sub ?? `นับ ${d.n} ตัว · เล็กสุด ${fmt1(d.min)} ก. ใหญ่สุด ${fmt1(d.max)} ก.`}</span>
      </div>
      {d.rows.map((r) => (
        <div className="dr" key={r.label}>
          <div className="dl">
            <b>{r.label}</b>
            <span>{r.grams}</span>
          </div>
          <div className="db">
            <i style={{ width: `${Math.max(4, Math.round((r.count / max) * 100))}%`, background: DIST_COLOR[r.kind] }} />
          </div>
          <div className="dv">
            <b>{r.pct}%</b>
            <span>{r.count} ตัว</span>
          </div>
        </div>
      ))}
      <div className="dleg">
        {legend
          .filter(([k]) => kinds.has(k))
          .map(([k, l]) => (
            <span key={k}>
              <i style={{ background: DIST_COLOR[k] }} />
              {l}
            </span>
          ))}
        <span>ชื่อแถว คือ ตัวต่อกิโล</span>
      </div>
      <div className={`dsay${say.plain ? ' s' : ''}`}>
        {say.lead ? <b>{say.lead}</b> : null}
        {say.rest}
        {extra ? ` · ${extra}` : ''}
      </div>
    </div>
  )
}

/** Amber box with one action, for a result that looks wrong. */
export function WarnBox({ t, s, action, onAction }: { t: string; s: string; action: string; onAction?: () => void }) {
  return (
    <div className="wbox" role="alert">
      <div className="wt">
        <Icon n="warn" />
        <div>
          <b>{t}</b>
          <span>{s}</span>
        </div>
      </div>
      {onAction ? (
        <button type="button" onClick={onAction}>
          <Icon n="redo" />
          {action}
        </button>
      ) : null}
    </div>
  )
}

const NetRing = () => (
  <svg className="i" style={{ color: '#2D6BC4' }} viewBox="0 0 24 24" fill="none" strokeWidth="2.2" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" />
  </svg>
)

/** "ยอที่ใช้เทียบ · ยอกลม 82 ซม. · จำไว้แล้ว" above the photo step. */
export function NetChip({ shape, cm }: { shape: 'round' | 'square'; cm: number }) {
  return (
    <div className="netc">
      <NetRing />
      <div>
        <small>ยอที่ใช้เทียบ</small>
        <b>
          {NET_SHAPE_LABEL[shape]} {cm} ซม.
        </b>
      </div>
      <span className="ok">
        <Icon n="check" />
        จำไว้แล้ว
      </span>
    </div>
  )
}

/** "เทียบกับ · ยอกลม 82 ซม. · แก้ขนาดยอ" under a result. */
export function NetUsed({ shape, cm, onEdit }: { shape: 'round' | 'square'; cm: number; onEdit?: () => void }) {
  return (
    <div className="netr">
      <NetRing />
      <div>
        <small>เทียบกับ</small>
        <b>
          {NET_SHAPE_LABEL[shape]} {cm} ซม.
        </b>
      </div>
      {onEdit ? (
        <button type="button" onClick={onEdit}>
          แก้ขนาดยอ
        </button>
      ) : null}
    </div>
  )
}

/** Shrimp with their dot band, for the crop and the photo. */
export function bandedShrimp(r: ScanResult): { x: number; y: number; band: Band }[] {
  const cuts = bandCuts(r.abw)
  return r.shrimp.map((s) => ({ x: s.x, y: s.y, band: bandOf(s.g, cuts) }))
}

/** The lighter-than-before warning text, or null. */
export function lighterWarning(r: ScanResult): { t: string; s: string } | null {
  if (!isLighter(r.abw, r.previous)) return null
  const prev = r.previous!
  return {
    t: 'เบากว่ารอบก่อน',
    s: `${fmtDay(prev.date)} บ่อนี้วัดได้ ${fmt1(prev.abw)} กรัม วันนี้ ${fmt1(r.abw)} กรัม กุ้งไม่น่าเล็กลง ขอบยออาจกว้างเกินขอบพื้นยอ`,
  }
}

/**
 * A scan result: weight, size, the cropped photo with dots, the warning when
 * it is lighter than last time, sizes by class, and the net it was measured
 * against.
 */
export function ResultBody({
  pondCode,
  photoUrl,
  aspect,
  r,
  target,
  onEditNet,
  onFixRim,
  note,
  children,
}: {
  pondCode: string
  photoUrl: string
  aspect: number
  r: ScanResult
  target: number
  onEditNet?: () => void
  onFixRim?: () => void
  note?: string
  children?: ReactNode
}) {
  const cuts = bandCuts(r.abw)
  const bands: [Band, string][] = [
    ['s', `ต่ำกว่า ${cuts[0]} ก.`],
    ['m', `${cuts[0]} ถึง ${cuts[1]} ก.`],
    ['l', `${cuts[1]} ก. ขึ้นไป`],
  ]
  const warn = lighterWarning(r)
  // The result arrives on the measuring screen's step: it fades in, its numbers a beat later (แบบ 2).
  return (
    <div className="rbody w-fade">
      <Head2 t={`ไซส์กุ้ง บ่อ ${pondCode}`} d={`วัดจากกุ้ง ${r.count} ตัวที่เห็นครบตัว · ${fmtDayYear(bangkokDay(r.measuredAt))}`} />
      <div className="res">
        <Crop photoUrl={photoUrl} aspect={aspect} shape={r.net.shape} rim={r.rim} shrimp={bandedShrimp(r)} width={150} />
        <div className="rn w-num">
          <span>
            <small>น้ำหนักเฉลี่ย</small>
            <b>{fmt1(r.abw)}</b>
            <em>กรัมต่อตัว</em>
          </span>
          <span>
            <small>ไซส์</small>
            <b className="s">{Math.round(r.perKg)} ตัว/กก.</b>
            <em>ยาว {fmt1(r.lengthCm)} ซม.</em>
          </span>
        </div>
      </div>
      <div className="dotk">
        <b>จุดในรูป</b>
        {bands.map(([b, l]) => (
          <span key={b}>
            <i style={{ background: BAND_COLOR[b] }} />
            {BAND_LABEL[b]} {l}
          </span>
        ))}
      </div>
      {warn ? <WarnBox t={warn.t} s={warn.s} action="แก้ขอบยอ ไม่ใช้เครดิต" onAction={onFixRim} /> : null}
      <DistBody grams={r.shrimp.map((s) => s.g)} target={target} />
      <NetUsed shape={r.net.shape} cm={r.net.cm} onEdit={onEditNet} />
      {children}
      {note ? <Tip plain>{note}</Tip> : null}
    </div>
  )
}
