import { useEffect, useRef, useState } from 'react'
import { NET_CM_MAX, NET_CM_MIN, type Net, type NetShape } from '@/api/types'
import { NET_SHAPE_LABEL } from '@/copy/th'
import { NET_SHAPES } from '@/lib/rim'
import { Icon } from './Icon'
import { Chip, Head2, Head3, MBtn, Tip } from './ui'
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
  label = 'ยอกว้าง เซนติเมตร',
}: {
  value: string
  onValue: (v: string) => void
  onCommit?: (n: number) => void
  autoFocus?: boolean
  label?: string
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
            aria-label={label}
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

/** The tape across the floor, edge to edge, with the size on it (แบบ 2): only on the chosen card once there is a size. */
function Ruler({ x0, x1, cm }: { x0: number; x1: number; cm: number }) {
  const label = `${cm} ซม.`
  const w = 14 + label.length * 6.6
  return (
    <g className="w-fade">
      <path d={`M${x0} 48H${x1}M${x0} 42V54M${x1} 42V54`} stroke="#F08A00" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <rect x={60 - w / 2} y={39} width={w} height={18} rx={9} fill="#F08A00" />
      <text x="60" y="52" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" fontFamily="'JetBrains Mono', ui-monospace, monospace">
        {label}
      </text>
    </g>
  )
}
const RoundArt = ({ cm }: { cm: number | null }) => (
  <svg viewBox="0 0 120 96" aria-hidden="true">
    <circle cx="60" cy="48" r="42" fill="#E3E9F2" stroke="#2D6BC4" strokeWidth="5" />
    <circle cx="60" cy="48" r="34" fill="#C9D3DF" stroke="#8796A8" strokeWidth="1.5" />
    <path d="M30 48H90M60 18V78M39 27L81 69M81 27L39 69" stroke="#AAB6C4" strokeWidth="1" />
    {cm ? <Ruler x0={26} x1={94} cm={cm} /> : null}
  </svg>
)
const SquareArt = ({ cm }: { cm: number | null }) => (
  <svg viewBox="0 0 120 96" aria-hidden="true">
    <rect x="16" y="6" width="88" height="84" rx="4" fill="#E3E9F2" stroke="#2D6BC4" strokeWidth="5" />
    <rect x="24" y="14" width="72" height="68" fill="#C9D3DF" stroke="#8796A8" strokeWidth="1.5" />
    <path d="M24 48H96M60 14V82M24 31H96M24 65H96M42 14V82M78 14V82" stroke="#AAB6C4" strokeWidth="1" />
    {cm ? <Ruler x0={24} x1={96} cm={cm} /> : null}
  </svg>
)

/** The ยอ step's answer so far: the shape, then a saved size or a new one typed in. */
export interface NetChoice {
  shape: NetShape | null
  netId: string | null
  /** Typing a new size (always, when the farm has none of this shape saved). */
  adding: boolean
  typed: string
}

/** Start from the ยอ this pond used last time, or from nothing on a farm's first scan. */
export function netChoiceFrom(pondNet: Net | null): NetChoice {
  // With one shape to choose, the farm's first scan starts on it.
  const only = NET_SHAPES.length === 1 ? NET_SHAPES[0]! : null
  return pondNet ? { shape: pondNet.shape, netId: pondNet.id, adding: false, typed: '' } : { shape: only, netId: null, adding: false, typed: '' }
}

/** What ถัดไป does with the choice: use a saved ยอ, save a new size, or nothing yet. */
export function netChoiceWants(c: NetChoice, nets: Net[]): { net: Net } | { shape: NetShape; cm: number } | null {
  if (!c.shape) return null
  const saved = nets.filter((n) => n.shape === c.shape)
  if (c.adding || saved.length === 0) return validCm(Number(c.typed)) ? { shape: c.shape, cm: Number(c.typed) } : null
  const net = saved.find((n) => n.id === c.netId)
  return net ? { net } : null
}

/**
 * Step 2 of สแกนกุ้ง (แบบ 2, O19a): which ยอ this pond uses. The shape as two
 * cards, then its size: the sizes น้ำ already knows for that shape as rows, or
 * typed once on the number keypad (no preset sizes). Nothing is saved until
 * ถัดไป; the screen only holds the choice.
 */
export function NetStep({
  pondCode,
  nets,
  pondNet,
  choice,
  onChoice,
}: {
  pondCode: string
  nets: Net[]
  pondNet: Net | null
  choice: NetChoice
  onChoice: (c: NetChoice) => void
}) {
  const { shape } = choice
  const saved = shape ? nets.filter((n) => n.shape === shape) : []
  const typing = choice.adding || saved.length === 0
  const want = netChoiceWants(choice, nets)
  const cm = want ? ('net' in want ? want.net.cm : want.cm) : null

  const pickShape = (s: NetShape) => {
    if (s === shape) return
    const same = nets.filter((n) => n.shape === s)
    const keep = pondNet?.shape === s ? pondNet : same.length === 1 ? same[0]! : null
    onChoice({ shape: s, netId: keep?.id ?? null, adding: false, typed: choice.typed })
  }

  return (
    <>
      <Head2
        t={`บ่อ ${pondCode} ใช้ยอแบบไหนคะ`}
        d={nets.length ? 'น้ำเลือกยอที่บ่อนี้ใช้ไว้ให้ วันนี้ใช้ยออื่น แตะเปลี่ยนได้เลยค่ะ' : 'น้ำเทียบตัวกุ้งกับขนาดยอ ตอบครั้งเดียว ครั้งหน้าน้ำจำไว้ให้'}
      />
      <div className="nsh" role="radiogroup" aria-label="รูปทรงยอ">
        {NET_SHAPES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={shape === s} className={shape === s ? 'on' : ''} onClick={() => pickShape(s)}>
            {s === 'round' ? <RoundArt cm={shape === s ? cm : null} /> : <SquareArt cm={shape === s ? cm : null} />}
            {NET_SHAPE_LABEL[s]}
            <span className="nck">
              <Icon n="check" />
            </span>
          </button>
        ))}
      </div>
      {shape ? (
        <div className="grp w-rise" key={shape}>
          <Head3
            t={shape === 'round' ? 'ยอกว้างเท่าไหร่' : 'ยอด้านละเท่าไหร่'}
            d={shape === 'round' ? 'ขึงสายวัดผ่านกลางยอ จากขอบพื้นตาข่ายฝั่งหนึ่งถึงอีกฝั่ง' : 'วัดด้านใดด้านหนึ่ง จากมุมพื้นตาข่ายถึงอีกมุม'}
          />
          {saved.length ? (
            <div role="radiogroup" aria-label={shape === 'round' ? 'ยอกว้างเท่าไหร่' : 'ยอด้านละเท่าไหร่'}>
              <NetRows
                nets={saved}
                picked={choice.adding ? null : choice.netId}
                onPick={(n) => onChoice({ ...choice, netId: n.id, adding: false })}
                adding={choice.adding}
                onAdd={() => onChoice({ ...choice, netId: null, adding: true })}
              />
            </div>
          ) : null}
          {typing ? (
            <div className={`grp${saved.length ? ' w-rise' : ''}`}>
              <b className="l5">{shape === 'round' ? 'ยอของพี่กว้างกี่เซนติเมตร' : 'ยอของพี่ด้านละกี่เซนติเมตร'}</b>
              <NetField
                value={choice.typed}
                onValue={(v) => onChoice({ ...choice, typed: v })}
                autoFocus={saved.length > 0}
                label={shape === 'round' ? 'ยอกว้าง เซนติเมตร' : 'ยอด้านละ เซนติเมตร'}
              />
              <span className="l5 mut">ใส่ตามที่วัดได้ ไม่ต้องปัดเป็นเลขกลม · น้ำจำไว้ให้ ครั้งหน้าไม่ต้องใส่อีก</span>
            </div>
          ) : null}
          <Tip>ไม่แน่ใจขนาด ลองขึงสายวัดดูก่อนนะคะ · ขนาดคลาด 2 ซม. น้ำหนักกุ้งอาจคลาดได้ราว 6 ถึง 13%</Tip>
        </div>
      ) : null}
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
  adding,
}: {
  nets: Net[]
  picked?: string | null
  onPick?: (n: Net) => void
  onEdit?: (n: Net) => void
  onAdd: () => void
  /** The new-size row is the one chosen (the picker, while typing a size). */
  adding?: boolean
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
      <button type="button" className={`snr add${adding ? ' on' : ''}`} aria-pressed={onEdit ? undefined : Boolean(adding)} onClick={onAdd}>
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
        {NET_SHAPES.map((s) => (
          <Chip key={s} on={shape === s} onClick={() => setShape(s)}>
            {NET_SHAPE_LABEL[s]}
          </Chip>
        ))}
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
