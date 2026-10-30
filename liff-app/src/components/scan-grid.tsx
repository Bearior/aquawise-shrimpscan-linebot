import { useMemo, useState } from 'react'
import type { TeamDay } from '@/api/types'
import { fmtWeekdayShort } from '@/lib/format'
import { CELL, CELL_RADIUS, RAMP, buildScanGrid, type GridCell } from '@/lib/scan-grid'

/**
 * The farm's last 13 weeks, a square a morning, darker the more ponds were
 * scanned (line-bot's สมุดฟาร์ม graph, read as ponds instead of records). It
 * fills the card's width, so a square is a fair tap: the line under the grid
 * says that day's count. Today is outlined.
 */
export function ScanGrid({ history, total, today }: { history: TeamDay[]; total: number; today: string }) {
  const layout = useMemo(() => buildScanGrid(history, total, today), [history, total, today])
  const [picked, setPicked] = useState<GridCell | null>(null)
  if (!layout) return null
  const full = layout.cells.filter((c) => c.level === 4).length
  const say = picked
    ? `${picked.date === today ? 'วันนี้' : fmtWeekdayShort(picked.date)} · ${picked.done ? `สแกน ${picked.done} จาก ${total} บ่อ` : 'ไม่มีใครสแกน'}`
    : `13 สัปดาห์ที่ผ่านมา · สแกนครบทุกบ่อ ${full} วัน`

  return (
    <div className="ag">
      <svg
        className="ag-svg"
        role="img"
        aria-label={`13 สัปดาห์ที่ผ่านมา สแกนครบทุกบ่อ ${full} วัน`}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
      >
        {layout.months.map((m) => (
          <text key={`m${m.x}`} x={m.x} y={m.y} className="ag-l">
            {m.text}
          </text>
        ))}
        {layout.days.map((d) => (
          <text key={d.text} x={d.x} y={d.y} className="ag-l" textAnchor="end" dominantBaseline="central">
            {d.text}
          </text>
        ))}
        {layout.cells.map((c) => (
          <rect
            key={c.date}
            data-date={c.date}
            data-level={c.level}
            x={c.x}
            y={c.y}
            width={CELL}
            height={CELL}
            rx={CELL_RADIUS}
            fill={RAMP[c.level]}
            className={`${c.date === today ? 'td' : ''}${picked?.date === c.date ? ' on' : ''}`}
            onClick={() => setPicked(picked?.date === c.date ? null : c)}
          />
        ))}
      </svg>
      <div className="ag-f">
        <span className="ag-say" aria-live="polite">
          {say}
        </span>
        <span className="ag-key" aria-hidden="true">
          น้อย
          {RAMP.map((fill) => (
            <i key={fill} style={{ background: fill }} />
          ))}
          ครบ
        </span>
      </div>
    </div>
  )
}
