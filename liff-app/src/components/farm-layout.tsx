import { useState } from 'react'
import { Icon } from './Icon'
import { Sheet } from './Page'
import { Btn, InlineError } from './ui'
import { MAX_CODE, ZONE_NAME_MAX, nextCodes, pondNameProblem, prefixOf, zoneLabel } from '@/lib/farm-layout'

/**
 * The pond count typed straight in. It holds what is typed (an empty box
 * while the old number is cleared) and hands on each whole number; leaving
 * the box puts back the count that stands.
 */
function CountField({ value, onCount, label }: { value: number; onCount: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="mono"
      inputMode="numeric"
      value={draft ?? String(value)}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, '').slice(0, 3)
        setDraft(d)
        if (Number(d) > 0) onCount(Number(d))
      }}
      onBlur={() => setDraft(null)}
      aria-label={label}
    />
  )
}

/** − count + for a number of ponds; the caller clamps what `onCount` hands it. */
export function CountStepper({ value, onCount, max, label }: { value: number; onCount: (n: number) => void; max: number; label: string }) {
  return (
    <div className="ob-step" role="group" aria-label={label}>
      <button type="button" aria-label="ลดบ่อ" disabled={value <= 1} onClick={() => onCount(value - 1)}>
        <Icon n="minus" />
      </button>
      <CountField value={value} onCount={onCount} label={label} />
      <button type="button" aria-label="เพิ่มบ่อ" disabled={value >= max} onClick={() => onCount(value + 1)}>
        <Icon n="plus" />
      </button>
    </div>
  )
}

/**
 * เปลี่ยนชื่อบ่อ: the zone's letters stay at the head (they are what files the
 * pond under its zone) and the rest is typed. `taken` says whether another
 * pond already has a name.
 */
export function PondNameSheet({
  zone,
  current,
  taken,
  busy,
  error,
  onSave,
  onCancel,
}: {
  zone: string
  current: string
  taken: (code: string) => boolean
  busy?: boolean
  error?: unknown
  onSave: (code: string) => void
  onCancel: () => void
}) {
  const head = prefixOf(zone)
  const [rest, setRest] = useState(current.slice(head.length))
  const code = `${head}${rest.trim().toUpperCase()}`
  const same = code === current.toUpperCase()
  const problem = pondNameProblem(zone, rest, (c) => c.toUpperCase() !== current.toUpperCase() && taken(c))
  const save = () => {
    if (rest.trim() && !problem && !busy) onSave(code)
  }
  return (
    <Sheet onCancel={onCancel} label="เปลี่ยนชื่อบ่อ" className="ob-rn">
      <b className="l2">เปลี่ยนชื่อบ่อ {current}</b>
      <span className="l5 mut">{head ? `ขึ้นต้นด้วย ${head} เสมอ บ่อจะได้อยู่ในโซน ${zone} ค่ะ` : 'ขึ้นต้นด้วยตัวเลขหรือคำไทยค่ะ'}</span>
      <form
        className={`ob-rnf${problem ? ' bad' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {head ? <span className="mono">{head}</span> : null}
        <input
          className="mono"
          value={rest}
          maxLength={MAX_CODE - head.length}
          onChange={(e) => setRest(e.target.value)}
          aria-label={head ? `ชื่อบ่อต่อจาก ${head}` : 'ชื่อบ่อ'}
          autoFocus
        />
      </form>
      {problem ? <span className="fielderr">{problem}</span> : null}
      <InlineError error={error} />
      <Btn busy={busy} disabled={busy || !rest.trim() || Boolean(problem) || same} onClick={save}>
        ใช้ชื่อนี้
      </Btn>
    </Sheet>
  )
}

/**
 * ชื่อโซน: a name people say ('หน้าบ้าน', 'ฝั่งคลอง') on top of the letter.
 * Never required: left empty, the zone reads โซน A, and the ponds keep their
 * names either way.
 */
export function ZoneNameSheet({
  zone,
  name,
  busy,
  error,
  onSave,
  onCancel,
}: {
  zone: string
  name: string | null
  busy?: boolean
  error?: unknown
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(name ?? '')
  const clean = draft.replace(/\s+/g, ' ').trim()
  const same = clean === (name ?? '')
  return (
    <Sheet onCancel={onCancel} label={`ตั้งชื่อโซน ${zone}`} className="ob-rn">
      <b className="l2">ตั้งชื่อโซน {zone}</b>
      <span className="l5 mut">ชื่อที่ทุกคนในฟาร์มเรียกกัน ไม่ใส่ก็ได้ค่ะ ชื่อบ่อไม่เปลี่ยน</span>
      <form
        className="ob-rnf zn"
        onSubmit={(e) => {
          e.preventDefault()
          if (!same && !busy) onSave(clean)
        }}
      >
        <input value={draft} maxLength={ZONE_NAME_MAX} onChange={(e) => setDraft(e.target.value)} aria-label={`ชื่อโซน ${zone}`} placeholder="เช่น หน้าบ้าน" autoFocus />
      </form>
      <InlineError error={error} />
      <Btn busy={busy} disabled={busy || same} onClick={() => onSave(clean)}>
        {clean ? 'ใช้ชื่อนี้' : `ใช้ชื่อ โซน ${zone}`}
      </Btn>
      {name ? (
        <Btn kind="l" disabled={busy} onClick={() => onSave('')}>
          ไม่ตั้งชื่อ ใช้ โซน {zone}
        </Btn>
      ) : null}
    </Sheet>
  )
}

/**
 * เพิ่มบ่อ, into a zone the farm has or a new one (then with the zone's name,
 * if any). The new ponds count on from the zone's highest number, shown before
 * anything is saved.
 */
export function AddPondsSheet({
  zone,
  isNew,
  existing,
  max,
  busy,
  error,
  onSave,
  onCancel,
}: {
  zone: string
  isNew: boolean
  /** Every pond name on the farm. */
  existing: string[]
  /** The most this add may make. */
  max: number
  busy?: boolean
  error?: unknown
  onSave: (codes: string[], zoneName: string) => void
  onCancel: () => void
}) {
  const [count, setCount] = useState(Math.min(isNew ? 10 : 1, max))
  const [name, setName] = useState('')
  const codes = nextCodes(zone, existing, count)
  const clamp = (n: number) => setCount(Math.max(1, Math.min(max, Math.round(n) || 1)))
  return (
    <Sheet onCancel={onCancel} label={isNew ? `เพิ่มโซน ${zone}` : `เพิ่มบ่อใน${zoneLabel(zone)}`} className="ob-rn pe-add-s">
      <b className="l2">{isNew ? `เพิ่มโซน ${zone}` : `เพิ่มบ่อในโซน ${zone}`}</b>
      {isNew ? (
        <label className="pe-f">
          <span>ชื่อโซน (ไม่ใส่ก็ได้)</span>
          <span className="ob-rnf zn">
            <input value={name} maxLength={ZONE_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="เช่น หลังบ้าน" aria-label={`ชื่อโซน ${zone}`} />
          </span>
        </label>
      ) : null}
      <div className="pe-cnt">
        <span>กี่บ่อ</span>
        <CountStepper value={count} onCount={clamp} max={max} label={`จำนวนบ่อที่เพิ่มในโซน ${zone}`} />
      </div>
      <p className="pe-pre">
        บ่อใหม่{' '}
        <b className="mono">
          {codes[0]}
          {codes.length > 1 ? ` ถึง ${codes[codes.length - 1]}` : ''}
        </b>
        <br />
        <span>เปลี่ยนชื่อทีละบ่อได้หลังเพิ่มค่ะ</span>
      </p>
      <InlineError error={error} />
      <Btn busy={busy} disabled={busy || !codes.length} onClick={() => onSave(codes, name.replace(/\s+/g, ' ').trim())}>
        เพิ่ม {count} บ่อ
      </Btn>
    </Sheet>
  )
}
