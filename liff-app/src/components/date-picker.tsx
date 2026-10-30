import { useState, type ReactNode } from 'react'
import { fmtDayYear } from '@/lib/format'
import { Icon } from './Icon'
import { Sheet } from './Page'

/**
 * The app's one calendar, ported from line-bot's `MonthGrid`, `DateField`
 * and `DatePickerSheet` (liff-app/src/components on launch-prep) instead of
 * the phone's own date dialog (Bear, 2026-10-31: "อยากให้ใช้ Component แบบ
 * เดียวกับใน Line Bot nongnam"). Monday first, the Buddhist year, today
 * outlined, the chosen day filled, days outside `min`..`max` greyed and dead.
 */

const MONTHS_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const WEEKDAYS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']
/** Six rows always: a month of five rows would move the sheet under the thumb when paging. */
const CELLS = 42

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

function monthOf(iso: string | null | undefined): { y: number; m: number } | null {
  const hit = iso ? /^(\d{4})-(\d{2})-\d{2}$/.exec(iso) : null
  return hit ? { y: Number(hit[1]), m: Number(hit[2]) - 1 } : null
}

/**
 * One month, Monday first. ISO days compare as strings (no Date parsing, so
 * no time zone can shift a day); `today` is the farm's day, from the session.
 */
export function MonthGrid({
  value,
  onPick,
  today,
  min,
  max,
}: {
  value: string | null
  onPick: (iso: string) => void
  today: string
  min?: string | null
  max?: string | null
}) {
  const [cursor, setCursor] = useState(() => monthOf(value) ?? monthOf(today) ?? { y: 2026, m: 0 })
  const first = (new Date(Date.UTC(cursor.y, cursor.m, 1)).getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate()
  const cells: (number | null)[] = [...Array.from({ length: first }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)]
  while (cells.length < CELLS) cells.push(null)
  const shift = (d: number) =>
    setCursor(({ y, m }) => {
      const n = m + d
      return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }
    })
  // Paging stops where no day could be picked any more.
  const canBack = !min || min < isoOf(cursor.y, cursor.m, 1)
  const canNext = !max || max > isoOf(cursor.y, cursor.m, days)

  return (
    <div className="dp" data-testid="month-grid">
      <div className="dp-h">
        <button type="button" onClick={() => shift(-1)} disabled={!canBack} aria-label="เดือนก่อน">
          <Icon n="back" />
        </button>
        <b>
          {MONTHS_LONG[cursor.m]} {cursor.y + 543}
        </b>
        <button type="button" onClick={() => shift(1)} disabled={!canNext} aria-label="เดือนถัดไป">
          <Icon n="chev" />
        </button>
      </div>
      <div className="dp-w" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="dp-g">
        {cells.map((day, i) => {
          if (day === null) return <span key={`b${i}`} />
          const iso = isoOf(cursor.y, cursor.m, day)
          const outside = (min != null && iso < min) || (max != null && iso > max)
          const on = iso === value
          return (
            <button
              key={iso}
              type="button"
              disabled={outside}
              className={`${on ? 'on' : ''}${iso === today ? ' td' : ''}`}
              aria-pressed={on}
              aria-label={`${day} ${MONTHS_LONG[cursor.m]}`}
              onClick={() => {
                if (!outside) onPick(iso)
              }}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The field: the chosen day in a box that opens the calendar, or the placeholder while none is chosen. */
export function DateField({ iso, placeholder, onOpen, label, chip }: { iso: string | null; placeholder: string; onOpen: () => void; label: string; chip?: ReactNode }) {
  return (
    <button type="button" className={`dp-f${iso ? ' on' : ''}`} onClick={onOpen} aria-label={`${label} ${iso ? fmtDayYear(iso) : placeholder}`}>
      <Icon n="cal" />
      <span>{iso ? fmtDayYear(iso) : placeholder}</span>
      {chip ?? null}
    </button>
  )
}

/** The calendar in a sheet from the bottom, titled with the field's question; a tap on a day picks it and closes. */
export function DatePickerSheet({
  title,
  value,
  today,
  min,
  max,
  onPick,
  onCancel,
  footer,
}: {
  title: string
  value: string | null
  today: string
  min?: string | null
  max?: string | null
  onPick: (iso: string) => void
  onCancel: () => void
  /** Under the grid: one quiet control, such as taking the date off. */
  footer?: ReactNode
}) {
  return (
    <Sheet onCancel={onCancel} label={title} className="dp-s">
      <div className="kp-h">
        <h3>{title}</h3>
        <button type="button" className="ps-x" onClick={onCancel} aria-label="ปิด">
          <Icon n="x" />
        </button>
      </div>
      <MonthGrid value={value} onPick={onPick} today={today} min={min} max={max} />
      {footer ?? null}
    </Sheet>
  )
}
