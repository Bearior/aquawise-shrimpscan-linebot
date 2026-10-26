import type { GrowthPoint } from '@/api/types'
import { dayOfMonth, fmt1, fmtDay, monthShort } from '@/lib/format'

/**
 * Average weight over the crop, with the target size as a dashed teal line and
 * a dashed projection. `big` uses the large labels with units on the axes.
 */
export function GrowthChart({
  points,
  targetPerKg,
  w,
  h,
  big = true,
  projectDays = 7,
  gPerDay,
}: {
  points: GrowthPoint[]
  targetPerKg: number
  w: number
  h: number
  big?: boolean
  projectDays?: number
  gPerDay?: number | null
}) {
  if (points.length < 2) return <span className="l5 mut">ยังมีข้อมูลไม่พอวาดกราฟ ต้องสแกนอย่างน้อย 2 ครั้งค่ะ</span>
  const targetG = 1000 / targetPerKg
  const last = points[points.length - 1]!
  const rate = gPerDay ?? (last.abw - points[0]!.abw) / Math.max(1, last.day - points[0]!.day)
  const proj = { day: last.day + projectDays, abw: last.abw + rate * projectDays }
  const d0 = Math.floor((points[0]!.day - 4) / 10) * 10
  const d1 = proj.day + 2
  const ymax = Math.max(10, Math.ceil((Math.max(targetG, proj.abw, ...points.map((p) => p.abw)) * 1.1) / 10) * 10)
  const fs = big ? 13 : 10
  const fl = big ? 14 : 10.5
  const sw = big ? 3 : 2.4
  const ax = big ? '#4F4E62' : '#62617A'
  const l = big ? 30 : 26
  const r = 10
  const t = big ? 24 : 12
  const bt = big ? 24 : 20
  const x = (d: number) => l + ((d - d0) / (d1 - d0)) * (w - l - r)
  const y = (v: number) => t + ((ymax - v) / ymax) * (h - t - bt)
  const yTicks = Array.from({ length: ymax / 10 + 1 }, (_, i) => i * 10)
  const xTicks: number[] = []
  for (let d = Math.ceil(d0 / 20) * 20; d <= d1 - 4; d += 20) if (d > d0) xTicks.push(d)
  const label = `น้ำหนักเฉลี่ยจาก ${fmt1(points[0]!.abw)} กรัมถึง ${fmt1(last.abw)} กรัม ไซส์ ${targetPerKg} คือ ${fmt1(targetG)} กรัม`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {big ? (
        <text x={2} y={13} fontSize={fs} fill={ax}>
          กรัม
        </text>
      ) : null}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={l} x2={w - r} y1={y(v)} y2={y(v)} stroke="#ECECF2" />
          <text x={l - 5} y={y(v) + 4} textAnchor="end" fontSize={fs} fill={ax} fontFamily="JetBrains Mono">
            {v}
          </text>
        </g>
      ))}
      {xTicks.map((v) => (
        <text key={v} x={x(v)} y={h - 5} textAnchor="middle" fontSize={fs} fill={ax}>
          {v}
          {big ? ' วัน' : ''}
        </text>
      ))}
      <line x1={l} x2={w - r} y1={y(targetG)} y2={y(targetG)} stroke="#00706F" strokeWidth={big ? 2.4 : 1.8} strokeDasharray="2 4" />
      <text x={l + 5} y={y(targetG) - 6} fontSize={fl} fontWeight={700} fill="#004B4B">
        ไซส์ {targetPerKg} = {fmt1(targetG).replace(/\.0$/, '')} ก.
      </text>
      <path d={`M${x(last.day)} ${y(last.abw)} L${x(proj.day)} ${y(proj.abw)}`} stroke="#004AAD" strokeWidth={2} strokeDasharray="5 5" fill="none" />
      <path
        d={points.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)} ${y(p.abw).toFixed(1)}`).join(' ')}
        stroke="#004AAD"
        strokeWidth={sw}
        fill="none"
      />
      {points.map((p, i) => {
        const isLast = i === points.length - 1
        return (
          <circle
            key={i}
            cx={x(p.day)}
            cy={y(p.abw)}
            r={isLast ? (big ? 6 : 4.5) : big ? 3.6 : 3}
            fill={isLast ? '#004AAD' : '#fff'}
            stroke="#004AAD"
            strokeWidth={1.8}
          />
        )
      })}
    </svg>
  )
}

/** Weight at every scan of one pond (E2/E6). The last leg is red and dashed when it went down. */
export function WeightSpark({ points, lighter }: { points: { date: string; abw: number }[]; lighter: boolean }) {
  if (points.length < 2) return <span className="l5 mut">สแกนบ่อนี้ครั้งเดียว ยังไม่มีเส้นให้ดูค่ะ</span>
  const w = 296
  const h = 160
  const l = 34
  const r = 16
  const t = 18
  const bt = 28
  const red = '#B23A26'
  const blue = '#004AAD'
  const vals = points.map((p) => p.abw)
  const lo = Math.floor(Math.min(...vals) - 1)
  const hi = Math.ceil(Math.max(...vals) + 1)
  const n = points.length
  const x = (i: number) => l + (i * (w - l - r)) / (n - 1)
  const y = (v: number) => t + ((hi - v) / (hi - lo)) * (h - t - bt)
  const step = Math.max(1, Math.round((hi - lo) / 3))
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v)
  const lastLeg = lighter
  const label = `น้ำหนักเฉลี่ยทุกครั้งที่สแกน ${vals.map(fmt1).join(' ')} กรัม`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <text x={2} y={13} fontSize={13} fill="#4F4E62">
        กรัม
      </text>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={l} x2={w - r} y1={y(v)} y2={y(v)} stroke="#ECECF2" />
          <text x={l - 6} y={y(v) + 5} textAnchor="end" fontSize={13} fill="#4F4E62">
            {v}
          </text>
        </g>
      ))}
      <path
        d={points
          .slice(0, n - 1)
          .map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.abw)}`)
          .join('')}
        stroke={blue}
        strokeWidth={3}
        fill="none"
      />
      <path
        d={`M${x(n - 2)} ${y(points[n - 2]!.abw)}L${x(n - 1)} ${y(points[n - 1]!.abw)}`}
        stroke={lastLeg ? red : blue}
        strokeWidth={3}
        fill="none"
        strokeDasharray={lastLeg ? '6 5' : undefined}
      />
      {points.map((p, i) => {
        const isLast = i === n - 1
        const c = isLast && lastLeg ? red : blue
        return (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.abw)} r={isLast ? 6 : 4} fill={isLast ? c : '#fff'} stroke={c} strokeWidth={2} />
            <text x={x(i)} y={h - 6} textAnchor={i === 0 ? 'start' : isLast ? 'end' : 'middle'} fontSize={13} fill="#4F4E62">
              {n <= 5 || isLast || i === 0 ? fmtDay(p.date) : ''}
            </text>
          </g>
        )
      })}
      <text
        x={x(n - 1) - 10}
        y={y(points[n - 1]!.abw) + (lastLeg ? 6 : -10)}
        textAnchor="end"
        fontSize={14}
        fontWeight={700}
        fill={lastLeg ? red : blue}
      >
        {fmt1(points[n - 1]!.abw)} ก.
      </text>
    </svg>
  )
}

/** How many ponds reach the target each day for the next 14 days. */
export function QueueChart({ days, targetPerKg }: { days: { date: string; n: number }[]; targetPerKg: number }) {
  const maxN = Math.max(1, ...days.map((d) => d.n))
  const barH = (n: number) => (maxN <= 2 ? n * 30 : (n / maxN) * 80)
  const label = `จำนวนบ่อที่ถึงไซส์ ${targetPerKg} ใน 14 วัน: ${days
    .filter((d) => d.n)
    .map((d) => `${fmtDay(d.date)} ${d.n} บ่อ`)
    .join(', ') || 'ไม่มี'}`
  const months = [...new Set(days.map((d) => monthShort(d.date)))]
  return (
    <div className="qch" role="img" aria-label={label}>
      <div className="qbars">
        {days.map((d) => (
          <div key={d.date}>
            {d.n ? (
              <>
                <b>{d.n}</b>
                <i style={{ height: barH(d.n) }} />
              </>
            ) : (
              <i className="z" />
            )}
          </div>
        ))}
      </div>
      <div className="qdays">
        {days.map((d, i) => (
          <span key={d.date} className={i ? undefined : 't'}>
            {dayOfMonth(d.date)}
          </span>
        ))}
      </div>
      <div className="qmon">
        {months.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </div>
  )
}
