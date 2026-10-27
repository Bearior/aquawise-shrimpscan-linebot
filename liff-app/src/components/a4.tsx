import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { FarmSheet, PondSheet, PondStatus, PondTile } from '@/api/types'
import { NET_SHAPE_LABEL } from '@/copy/th'
import { cvPct, distribution, distSay, evenness, gramsAt } from '@/lib/sizes'
import { fmt1, fmtDay, fmtQueueDay, fmtTime, fmtTonnes, fmtWeekdayShort, fmtWeekdayYear } from '@/lib/format'
import { GrowthChart } from './charts'
import { Crop, bandedShrimp } from './result'

/**
 * The A4 sheets (O33, O34): black on white, nothing under 14px, the key
 * numbers 34 to 38px. Drawn at 794 x 1123 (A4 at 96 dpi) and scaled to fit.
 */

const A4_W = 794
const A4_H = 1123
const QUEUE_ROWS = 8
const WATCH_ROWS = 10

function Head({ t, sub, right }: { t: string; sub: ReactNode; right: ReactNode }) {
  return (
    <div className="ah">
      <div>
        <h1>{t}</h1>
        <div>{sub}</div>
      </div>
      <div className="ar">
        <b>AquaWise</b>
        {right}
      </div>
    </div>
  )
}

function Target({ perKg }: { perKg: number }) {
  return (
    <>
      <b>{perKg} ตัว/กก.</b> ({fmt1(gramsAt(perKg)).replace(/\.0$/, '')} กรัม)
    </>
  )
}

function Mark({ code, k }: { code: string; k: PondStatus }) {
  if (k === 'ready') return <span className="tg">{code}</span>
  if (k === 'urgent') return <span className="rg">{code}</span>
  if (k === 'missing') return <span className="rg d">{code}</span>
  if (k === 'watch')
    return (
      <span className="b">
        <span className="tri" />
        {code}
      </span>
    )
  return <span className="b">{code}</span>
}

/** ใบสรุปฟาร์ม page 1: the four groups, the 14-day queue, the ponds to check. */
export function A4Farm1({ s }: { s: FarmSheet }) {
  const queue = s.queue.slice(0, QUEUE_ROWS)
  const watch = s.watch.slice(0, WATCH_ROWS)
  const pondCount = s.zones.reduce((n, z) => n + z.ponds.length, 0)
  return (
    <div className="a4">
      <Head
        t="ใบสรุปฟาร์มประจำวัน"
        sub={
          <>
            {s.farmName} · {fmtWeekdayYear(s.date)} · จับขายที่ไซส์ <Target perKg={s.targetPerKg} />
          </>
        }
        right={
          <>
            พิมพ์ {fmtTime(s.printedAt)} น. · หน้า 1/2
            <br />
            สแกนวันนี้{' '}
            <b style={{ display: 'inline', color: '#111', fontSize: 14 }}>
              {s.photosToday.sent}/{s.photosToday.total}
            </b>{' '}
            บ่อ
          </>
        }
      />
      <div className="s4">
        <div className="k">
          <small>พร้อมจับ ภายใน 5 วัน</small>
          <b>
            {s.tiles.ready.n} <em>บ่อ</em>
          </b>
          <span>ราว {fmtTonnes(s.tiles.ready.tonnes)} ตัน</span>
        </div>
        <div>
          <small>โตดีตามเกณฑ์</small>
          <b>
            {s.tiles.good.n} <em>บ่อ</em>
          </b>
          <span>โตปกติ ไซส์เสมอ</span>
        </div>
        <div>
          <small>
            <span className="tri" />
            เฝ้าระวัง
          </small>
          <b>
            {s.tiles.watch.n} <em>บ่อ</em>
          </b>
          <span>ไซส์เริ่มไม่เสมอ</span>
        </div>
        <div>
          <small>ต้องดูด่วน</small>
          <b>
            {s.tiles.urgent.n} <em>บ่อ</em>
          </b>
          <span>
            โตช้า {s.tiles.urgent.slow} · ไม่ได้สแกน {s.tiles.urgent.missing}
          </span>
        </div>
      </div>
      <div>
        <h2>
          คิวจับ 14 วันข้างหน้า <small>(ไซส์ {s.targetPerKg} ตัว/กก.)</small>
        </h2>
        <table>
          <tbody>
            <tr>
              <th>วันที่จับ</th>
              <th>บ่อ</th>
              <th>ผู้ดูแล</th>
              <th className="r">ตัว/กก.</th>
              <th className="r">กรัม/ตัว</th>
              <th className="r">ตัน (คาด)</th>
              <th className="c">นัดแล้ว</th>
            </tr>
            {queue.map((q) => (
              <tr key={q.pondId}>
                <td className="b">{fmtQueueDay(q.date, s.date)}</td>
                <td>{q.soon ? <span className="tg">{q.pondCode}</span> : <b>{q.pondCode}</b>}</td>
                <td>{q.caretaker ?? ''}</td>
                <td className="r b">{q.perKg}</td>
                <td className="r">{fmt1(q.abw)}</td>
                <td className="r">{fmtTonnes(q.tonnes)}</td>
                <td className="c">
                  <span className="cbx" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="nt">
          แถบดำ คือพร้อมจับภายใน 5 วัน · ตันเป็นการประมาณจากการโตและจำนวนที่ลง
          {s.queue.length > queue.length ? ` · และอีก ${s.queue.length - queue.length} บ่อ` : ''}
        </div>
      </div>
      <div>
        <h2>
          บ่อที่ต้องตรวจเช็ค <small>({s.watch.length} บ่อ)</small>
        </h2>
        <table>
          <tbody>
            <tr>
              <th>บ่อ</th>
              <th>ผู้ดูแล</th>
              <th>เรื่อง</th>
              <th className="r">ตัว/กก.</th>
              <th style={{ width: '28%' }}>จดบันทึก</th>
            </tr>
            {watch.map((w) => (
              <tr key={w.pondCode}>
                <td>
                  <Mark code={w.pondCode} k={w.kind} />
                </td>
                <td>{w.caretaker ?? ''}</td>
                <td>{w.issue}</td>
                <td className="r b">{w.perKg ?? ''}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="nt">
          วงกลม คือต้องดูด่วน · วงประ คือยังไม่สแกนวันนี้ (ตัว/กก. จากครั้งก่อน) · สามเหลี่ยม คือเฝ้าระวัง
          {s.watch.length > watch.length ? ` · และอีก ${s.watch.length - watch.length} บ่อในหน้า 2` : ''}
        </div>
      </div>
      <div className="af">
        <span>ตารางครบ {pondCount} บ่อ ดูหน้า 2</span>
        <span>ลงชื่อเจ้าของฟาร์ม ..................................................</span>
      </div>
    </div>
  )
}

function ZoneTable({ zone, caretaker, ponds, target }: { zone: string; caretaker: string | null; ponds: PondTile[]; target: number }) {
  return (
    <table>
      <caption>
        โซน {zone}
        {caretaker ? ` · ${caretaker}` : ''}
      </caption>
      <tbody>
        <tr>
          <th>บ่อ</th>
          <th className="r">ตัว/กก.</th>
          <th className="r">กรัม</th>
          <th className="r">ก./วัน</th>
          <th>ถึงไซส์ {target}</th>
        </tr>
        {ponds.map((p) => (
          <tr key={p.id}>
            <td>
              <Mark code={p.code} k={p.status} />
            </td>
            <td className="r b">{p.perKg ?? ''}</td>
            <td className="r">{p.abw !== null ? fmt1(p.abw) : ''}</td>
            <td className="r">{p.gPerDay !== null ? p.gPerDay.toFixed(2) : ''}</td>
            <td>{p.status === 'missing' ? <b>ยังไม่สแกน</b> : p.reachOn ? (p.daysToTarget !== null && p.daysToTarget <= 0 ? 'วันนี้' : fmtDay(p.reachOn)) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** ใบสรุปฟาร์ม page 2: every pond, zone by zone. */
export function A4Farm2({ s }: { s: FarmSheet }) {
  const pondCount = s.zones.reduce((n, z) => n + z.ponds.length, 0)
  return (
    <div className="a4">
      <Head
        t={`ตารางทั้ง ${pondCount} บ่อ`}
        sub={
          <>
            {fmtWeekdayYear(s.date)} · วันที่ถึงไซส์ <Target perKg={s.targetPerKg} />
          </>
        }
        right={<>พิมพ์ {fmtTime(s.printedAt)} น. · หน้า 2/2</>}
      />
      <div className="z2">
        {s.zones.map((z) => (
          <ZoneTable key={z.zone} zone={z.zone} caretaker={z.caretaker} ponds={z.ponds} target={s.targetPerKg} />
        ))}
      </div>
      <div className="af">
        <span>แถบดำ คือพร้อมจับภายใน 5 วัน · สามเหลี่ยม คือเฝ้าระวัง · วงกลม คือต้องดูด่วน · วงประ คือยังไม่สแกน</span>
        <span style={{ whiteSpace: 'nowrap' }}>ลงชื่อ ..........................</span>
      </div>
    </div>
  )
}

/** ใบผลสแกนรายบ่อ (O34): one pond on one page, for the pond, a buyer or the raft. */
export function A4Pond({ s }: { s: PondSheet }) {
  const r = s.result
  const p = s.pond
  const grams = r.shrimp.map((q) => q.g)
  const d = distribution(grams, s.targetPerKg)
  const say = distSay(d, s.targetPerKg)
  const max = Math.max(1, ...d.rows.map((x) => x.count))
  const aspect = s.photoWidth && s.photoHeight ? s.photoWidth / s.photoHeight : 4 / 3
  const net = `${NET_SHAPE_LABEL[r.net.shape]} ${r.net.cm} ซม.`
  return (
    <div className="a4">
      <Head
        t={`ใบผลสแกนกุ้ง · บ่อ ${p.code}`}
        sub={
          <>
            {s.farmName} · {fmtWeekdayYear(s.scan.date)} {fmtTime(s.scan.at)}
            {p.ageDays !== null ? ` · เลี้ยง ${p.ageDays} วัน` : ''}
          </>
        }
        right={
          <>
            {s.scan.photoBy === s.scan.measuredBy ? `${s.scan.photoBy}สแกน` : `${s.scan.photoBy}ถ่าย · ${s.scan.measuredBy}วัด`}
            <br />
            เทียบกับ{net}
          </>
        }
      />
      <div className="pp">
        <div className="pc">
          <Crop photoUrl={s.scan.photoUrl} aspect={aspect} shape={r.net.shape} rim={r.rim} shrimp={bandedShrimp(r)} width={300} />
          <div className="nt">รูปยอเฉพาะในวงขอบพื้นยอ · จุดคือกุ้งแต่ละตัว</div>
        </div>
        <div className="pn4">
          <div>
            <small>น้ำหนักเฉลี่ย</small>
            <b>{fmt1(r.abw)}</b>
            <span>กรัมต่อตัว</span>
          </div>
          <div>
            <small>ไซส์</small>
            <b>{Math.round(r.perKg)}</b>
            <span>ตัวต่อกิโล</span>
          </div>
          <div>
            <small>ยาวเฉลี่ย</small>
            <b>{fmt1(r.lengthCm)}</b>
            <span>เซนติเมตร</span>
          </div>
          <div>
            <small>ความเสมอของไซส์</small>
            <b>{evenness(r.cv)}</b>
            <span>
              CV {cvPct(r.cv)}% · นับ {r.count} ตัว
            </span>
          </div>
        </div>
      </div>
      <div>
        <h2>
          ขนาดกุ้งในยอ <small>(แยกตามไซส์ ตัวต่อกิโล)</small>
        </h2>
        <table>
          <tbody>
            <tr>
              <th>ไซส์</th>
              <th>กรัมต่อตัว</th>
              <th className="r">จำนวน</th>
              <th className="r">สัดส่วน</th>
              <th style={{ width: '36%' }} />
            </tr>
            {d.rows.map((x) => (
              <tr key={x.label}>
                <td className="b">{x.label}</td>
                <td>{x.grams}</td>
                <td className="r">{x.count} ตัว</td>
                <td className="r b">{x.pct}%</td>
                <td>
                  <span className="bar" style={{ width: `${Math.round((x.count / max) * 100)}%` }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="nt">
          {say.lead ? `${say.lead} ` : ''}
          {say.rest}
        </div>
      </div>
      <div>
        <h2>
          การเติบโต <small>(น้ำหนักเฉลี่ยจากทุกครั้งที่สแกน)</small>
        </h2>
        <GrowthChart points={s.growth} targetPerKg={s.targetPerKg} w={714} h={170} gPerDay={p.gPerDay} />
        <div className="nt">
          {p.gPerDay !== null ? `โตวันละ ${p.gPerDay.toFixed(2)} กรัม` : 'ยังคิดอัตราโตไม่ได้'}
          {p.reachOn ? ` · คาดถึงไซส์ ${s.targetPerKg} (${fmt1(gramsAt(s.targetPerKg)).replace(/\.0$/, '')} กรัม) ราว ${fmtWeekdayShort(p.reachOn)}` : ''}
        </div>
      </div>
      <div className="sig">
        <div>ผู้วัด</div>
        <div>ผู้ตรวจ หรือผู้ซื้อ</div>
      </div>
      <div className="af">
        <span>ตัวเลขจากรูปยอ 1 รูป เป็นการประมาณ</span>
        <span>หน้า 1/1</span>
      </div>
    </div>
  )
}

/** A sheet shrunk to the width it is given, for the previews. */
export function Paper({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(280)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setW(el.clientWidth || 280)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const k = w / A4_W
  return (
    <div ref={ref} className="paper pz" style={{ width: '100%', height: A4_H * k }}>
      <div style={{ transform: `scale(${k})`, transformOrigin: '0 0', width: A4_W, height: A4_H, position: 'absolute', left: 0, top: 0 }}>{children}</div>
    </div>
  )
}

/** The tiny sheet on a print option card. */
export function Thumb({ children }: { children: ReactNode }) {
  return (
    <span className="mp" aria-hidden="true">
      {children}
    </span>
  )
}
