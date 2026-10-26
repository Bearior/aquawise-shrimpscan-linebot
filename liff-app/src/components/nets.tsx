import { useEffect, useRef, useState } from 'react'
import { NET_CM_MAX, NET_CM_MIN, type Net, type NetShape } from '@/api/types'
import { NET_SHAPE_LABEL } from '@/copy/th'
import { Icon } from './Icon'
import { Chip, Head2, Head3, MBtn, Saved, Tip } from './ui'
import { Sheet } from './Page'

export function validCm(n: number): boolean {
  return Number.isInteger(n) && n >= NET_CM_MIN && n <= NET_CM_MAX
}

/**
 * The typed ยอ width with − and + (1 cm a tap). A real numeric input, so the
 * phone's own number keypad comes up. `onCommit` fires when the keypad closes
 * (blur) or on Enter: there is no save button, the green line says so.
 */
export function NetField({
  value,
  onValue,
  onCommit,
  autoFocus,
}: {
  value: string
  onValue: (v: string) => void
  onCommit?: (n: number) => void
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const n = Number(value)
  const bad = value !== '' && !validCm(n)

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const step = (d: number) => {
    const base = validCm(n) ? n : 82
    const next = Math.min(NET_CM_MAX, Math.max(NET_CM_MIN, base + d))
    onValue(String(next))
    onCommit?.(next)
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className="szin">
        {/* mousedown preventDefault keeps the keypad up while stepping. */}
        <button type="button" aria-label="ลด 1 ซม." onMouseDown={(e) => e.preventDefault()} onClick={() => step(-1)}>
          <Icon n="minus" />
        </button>
        <label className={`fld${bad ? ' bad' : ''}`}>
          <input
            ref={ref}
            inputMode="numeric"
            pattern="[0-9]*"
            enterKeyHint="done"
            maxLength={3}
            aria-label="ยอกว้าง เซนติเมตร"
            value={value}
            onChange={(e) => onValue(e.target.value.replace(/\D/g, '').slice(0, 3))}
            onBlur={() => {
              if (validCm(Number(value))) onCommit?.(Number(value))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
          <span>ซม.</span>
        </label>
        <button type="button" aria-label="เพิ่ม 1 ซม." onMouseDown={(e) => e.preventDefault()} onClick={() => step(1)}>
          <Icon n="plus" />
        </button>
      </div>
      {bad ? (
        <span className="fielderr" role="alert">
          ใส่ได้ {NET_CM_MIN} ถึง {NET_CM_MAX} ซม. ลองวัดใหม่อีกครั้งนะคะ
        </span>
      ) : null}
    </div>
  )
}

const RoundArt = ({ cm }: { cm: string }) => (
  <svg viewBox="0 0 120 96" aria-hidden="true">
    <circle cx="60" cy="48" r="42" fill="#E3E9F2" stroke="#2D6BC4" strokeWidth="5" />
    <circle cx="60" cy="48" r="34" fill="#C9D3DF" stroke="#8796A8" strokeWidth="1.5" />
    <path d="M30 48H90M60 18V78M39 27L81 69M81 27L39 69" stroke="#AAB6C4" strokeWidth="1" />
    <path d="M26 48H94M26 42V54M94 42V54" stroke="#F08A00" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <rect x="37" y="56" width="46" height="17" rx="8.5" fill="#F08A00" />
    <text x="60" y="68.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="Noto Sans Thai">
      {cm || '?'} ซม.
    </text>
  </svg>
)
const SquareArt = () => (
  <svg viewBox="0 0 120 96" aria-hidden="true">
    <rect x="16" y="6" width="88" height="84" rx="4" fill="#E3E9F2" stroke="#2D6BC4" strokeWidth="5" />
    <rect x="24" y="14" width="72" height="68" fill="#C9D3DF" stroke="#8796A8" strokeWidth="1.5" />
    <path d="M24 48H96M60 14V82M24 31H96M24 65H96M42 14V82M78 14V82" stroke="#AAB6C4" strokeWidth="1" />
  </svg>
)

/**
 * The ยอ question, first time for the farm only (O14, O19a): the shape, then
 * the width typed in. Saves when the keypad closes; the green line confirms.
 */
export function NetAsk({ pondCode, saved, onSave }: { pondCode: string; saved: Net | null; onSave: (shape: NetShape, cm: number) => void }) {
  const [shape, setShape] = useState<NetShape>(saved?.shape ?? 'round')
  const [value, setValue] = useState(saved ? String(saved.cm) : '')
  const commit = (cm: number, sh: NetShape = shape) => {
    if (!validCm(cm)) return
    if (saved && saved.cm === cm && saved.shape === sh) return
    onSave(sh, cm)
  }
  return (
    <>
      <Head2 t={`บ่อ ${pondCode} ใช้ยอแบบไหนคะ`} d="น้ำเทียบตัวกุ้งกับขนาดยอ ใส่ครั้งเดียว น้ำจำไว้ให้ ครั้งหน้าไม่ถามอีก" />
      <div className="nsh" role="radiogroup" aria-label="รูปทรงยอ">
        {(['round', 'square'] as NetShape[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={shape === s}
            className={shape === s ? 'on' : ''}
            onClick={() => {
              setShape(s)
              if (validCm(Number(value))) commit(Number(value), s)
            }}
          >
            {s === 'round' ? <RoundArt cm={value} /> : <SquareArt />}
            {NET_SHAPE_LABEL[s]}
            <span className="nck">
              <Icon n="check" />
            </span>
          </button>
        ))}
      </div>
      <div className="grp">
        <Head3 t="ยอกว้างเท่าไหร่" d="ขึงสายวัดผ่านกลางยอ จากขอบพื้นตาข่ายฝั่งหนึ่งถึงอีกฝั่ง" />
        <NetField value={value} onValue={setValue} onCommit={(n) => commit(n)} />
        <span className="l5 mut">ใส่ตามที่วัดได้ ไม่ต้องปัดเป็นเลขกลม</span>
      </div>
      {saved ? (
        <div style={{ display: 'grid', gap: 2 }}>
          <Saved>บันทึกแล้ว · ใช้ {saved.cm} ซม. กับทุกบ่อในฟาร์ม</Saved>
          <span className="l5 mut">บ่อไหนใช้ยอต่างกัน ตั้งรายบ่อได้ที่หน้ายอของฟาร์ม</span>
        </div>
      ) : null}
      <Tip>ไม่แน่ใจขนาด ลองขึงสายวัดดูก่อนนะคะ · ขนาดคลาด 2 ซม. น้ำหนักกุ้งอาจคลาดได้ราว 6 ถึง 13%</Tip>
    </>
  )
}

/**
 * The ยอ sizes น้ำ remembers for this farm. As a picker (`pick`), or as rows
 * with a แก้ button (the farm page).
 */
export function NetRows({
  nets,
  picked,
  onPick,
  onEdit,
  onAdd,
}: {
  nets: Net[]
  picked?: string | null
  onPick?: (n: Net) => void
  onEdit?: (n: Net) => void
  onAdd: () => void
}) {
  return (
    <div className="snl">
      {nets.map((r) => {
        const inner = (
          <>
            <span className="v">
              <b>{r.cm}</b>
              <small>ซม.</small>
            </span>
            <span className="t">
              <b>{r.use}</b>
              <span>
                {NET_SHAPE_LABEL[r.shape]} · ใช้ {r.pondCount} บ่อ
              </span>
              <span>{r.addedBy}</span>
            </span>
          </>
        )
        return onEdit ? (
          <div className="snr" key={r.id}>
            {inner}
            <MBtn onClick={() => onEdit(r)}>แก้</MBtn>
          </div>
        ) : (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={r.id === picked}
            className={`snr${r.id === picked ? ' on' : ''}`}
            onClick={() => onPick?.(r)}
          >
            {inner}
            <span className="ck">
              <Icon n="check" />
            </span>
          </button>
        )
      })}
      <button type="button" className="snr add" onClick={onAdd}>
        <Icon n="plus" />
        ใส่ขนาดใหม่
      </button>
    </div>
  )
}

/**
 * A new (or edited) ยอ size, typed once, on the phone's number keypad. The
 * keypad's เสร็จ (Enter) saves; a tap outside the sheet cancels.
 */
export function NetNewSheet({
  title,
  after,
  initial,
  onDone,
  onCancel,
  busy,
}: {
  title: string
  after: string
  initial?: { shape: NetShape; cm: number }
  onDone: (shape: NetShape, cm: number) => void
  onCancel: () => void
  busy?: boolean
}) {
  const [shape, setShape] = useState<NetShape>(initial?.shape ?? 'round')
  const [value, setValue] = useState(initial ? String(initial.cm) : '')
  const done = () => {
    const n = Number(value)
    if (validCm(n) && !busy) onDone(shape, n)
  }
  return (
    <Sheet onCancel={onCancel} label={title}>
      <Head2 t={title} d="ขึงสายวัดผ่านกลางยอ จากขอบพื้นตาข่ายฝั่งหนึ่งถึงอีกฝั่ง" />
      <div className="nshc" role="radiogroup" aria-label="รูปทรงยอ">
        <Chip on={shape === 'round'} onClick={() => setShape('round')}>
          ยอกลม
        </Chip>
        <Chip on={shape === 'square'} onClick={() => setShape('square')}>
          ยอสี่เหลี่ยม
        </Chip>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          done()
        }}
      >
        <NetField value={value} onValue={setValue} autoFocus />
      </form>
      <span className="l5 mut">{after}</span>
      <button type="button" className="vbtn p" onClick={done} disabled={!validCm(Number(value)) || busy}>
        เสร็จ
      </button>
    </Sheet>
  )
}
