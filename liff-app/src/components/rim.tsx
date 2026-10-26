import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { NetShape, Pt } from '@/api/types'
import { centredGuess, clampPt, ellipsePath, fitRim, previewPath, QUAD_SIDES, RIM_SIDES, rimPath, rimUnit, type Rim } from '@/lib/rim'
import { Icon } from './Icon'
import { Tip } from './ui'

/** viewBox width; the height follows the photo's aspect. */
export const VW = 1000
/** The yellow ring is 3px on a 358px photo. In user units: the drawn-on stroke cannot be non-scaling. */
const RING_W = 8.4
/** A press this close to a point (px) takes the point. */
const GRAB_PX = 24

export interface RimPhotoProps {
  photoUrl: string
  /** width / height of the photo. */
  aspect: number
  shape?: NetShape
  pts: Pt[]
  /** Editable when set. */
  onChange?: (pts: Pt[]) => void
  sel?: number | null
  onSel?: (i: number | null) => void
  /** The rim used last time, dashed white (the fix screen). */
  ghost?: Pt[] | null
}

/**
 * The ยอ photo with the yellow rim and its 4 points, as แบบ 2 draws it. The
 * whole photo takes the finger: a press near a point drags it, a tap on a
 * point selects it for the arrows (Nudge), and with fewer than 4 points a tap
 * anywhere places the next one. A magnifier rides above the finger. The ring
 * draws itself on when it appears; points pop in as they are placed.
 */
export function RimPhoto({ photoUrl, aspect, shape = 'round', pts, onChange, sel = null, onSel, ghost }: RimPhotoProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mode = useRef<{ drag: number; moved: boolean; x: number; y: number } | { place: true } | null>(null)
  const [press, setPress] = useState<Pt | null>(null)
  const [boxSize, setBoxSize] = useState<{ w: number; h: number } | null>(null)

  const H = VW / aspect
  const rim = pts.length === 4 ? fitRim(shape, pts) : null
  const d = rim ? rimPath(rim, VW, H) : null
  const ghostRim = ghost && ghost.length === 4 ? fitRim(shape, ghost) : null
  const preview = onChange ? previewPath(shape, pts, aspect, VW, H) : null
  const unit = rimUnit(shape)

  const at = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current!.getBoundingClientRect()
    setBoxSize({ w: r.width, h: r.height })
    return { p: clampPt({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }), r }
  }

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!onChange) return
    const { p, r } = at(e)
    let near = -1
    let best = GRAB_PX
    pts.forEach((q, i) => {
      const dist = Math.hypot((q.x - p.x) * r.width, (q.y - p.y) * r.height)
      if (dist < best) {
        best = dist
        near = i
      }
    })
    if (near >= 0) mode.current = { drag: near, moved: false, x: e.clientX, y: e.clientY }
    else if (pts.length < 4) mode.current = { place: true }
    else {
      mode.current = null
      return
    }
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setPress(near >= 0 ? pts[near]! : p)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const m = mode.current
    if (!m || !onChange) return
    const { p } = at(e)
    if ('drag' in m) {
      if (!m.moved && Math.hypot(e.clientX - m.x, e.clientY - m.y) > 6) m.moved = true
      if (!m.moved) return
      onChange(pts.map((q, j) => (j === m.drag ? p : q)))
    }
    setPress(p)
  }
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const m = mode.current
    mode.current = null
    setPress(null)
    if (!m || !onChange) return
    if ('drag' in m) {
      onSel?.(m.moved ? m.drag : sel === m.drag ? null : m.drag)
      return
    }
    onChange([...pts, at(e).p])
    onSel?.(null)
  }
  const onCancel = () => {
    mode.current = null
    setPress(null)
  }

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (!onChange) return
    const step = e.shiftKey ? 0.02 : 0.005
    const delta: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    }
    const dv = delta[e.key]
    if (!dv) return
    e.preventDefault()
    onChange(pts.map((q, j) => (j === i ? clampPt({ x: q.x + dv[0], y: q.y + dv[1] }) : q)))
  }

  // The magnifier: 2.5x, above the finger (below it near the top edge).
  let loupe = null
  if (press && boxSize) {
    const Z = 2.5
    const px = press.x * boxSize.w
    const py = press.y * boxSize.h
    const lx = Math.max(-8, Math.min(boxSize.w - 84, px - 46))
    let ly = py - 130
    if (ly < -70) ly = py + 40
    loupe = (
      <span
        className="loupe"
        aria-hidden="true"
        style={{
          left: lx,
          top: ly,
          backgroundImage: `url(${photoUrl})`,
          backgroundSize: `${(boxSize.w * Z).toFixed(1)}px ${(boxSize.h * Z).toFixed(1)}px`,
          backgroundPosition: `${(43 - px * Z).toFixed(1)}px ${(43 - py * Z).toFixed(1)}px`,
        }}
      />
    )
  }

  const editable = Boolean(onChange)
  return (
    <div className="r2w">
      <div
        ref={boxRef}
        className={`r2 photo${editable ? ' ed' : ''}`}
        style={{ aspectRatio: String(aspect), backgroundImage: `url(${photoUrl})` }}
        role={editable ? 'group' : undefined}
        aria-label={editable ? (shape === 'square' ? 'รูปยอ แตะที่มุมพื้นยอเพื่อวางจุด' : 'รูปยอ แตะที่ขอบพื้นยอเพื่อวางจุด') : undefined}
        onPointerDown={editable ? onDown : undefined}
        onPointerMove={editable ? onMove : undefined}
        onPointerUp={editable ? onUp : undefined}
        onPointerCancel={editable ? onCancel : undefined}
      >
        <svg viewBox={`0 0 ${VW} ${H.toFixed(1)}`} preserveAspectRatio="none" aria-hidden="true">
          {d ? (
            <>
              <path className="w-fade" d={`M0 0H${VW}V${H.toFixed(1)}H0Z ${d}`} fillRule="evenodd" fill="rgba(13,12,24,.45)" />
              <path d={d} fill="none" stroke="rgba(10,20,40,.55)" strokeWidth={6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <path className="w-draw" pathLength={1} d={d} fill="none" stroke="#FFD23F" strokeWidth={RING_W} strokeLinejoin="round" />
            </>
          ) : null}
          {preview ? (
            <path
              className="w-fade"
              d={preview}
              fill="none"
              stroke="#FFD23F"
              strokeWidth={2.5}
              strokeDasharray="7 6"
              strokeLinejoin="round"
              opacity={0.9}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {ghostRim ? (
            <path d={rimPath(ghostRim, VW, H)} fill="none" stroke="#fff" strokeWidth={2.5} strokeDasharray="8 6" vectorEffect="non-scaling-stroke" />
          ) : null}
        </svg>
        {editable
          ? pts.map((q, i) => (
              <button
                key={i}
                type="button"
                className={`mk w-pop${i === sel ? ' on' : ''}`}
                style={{ left: `${(q.x * 100).toFixed(2)}%`, top: `${(q.y * 100).toFixed(2)}%` }}
                aria-label={`${unit}ที่ ${i + 1}${i === sel ? ' เลือกอยู่' : ''}`}
                aria-pressed={i === sel}
                onClick={() => onSel?.(sel === i ? null : i)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <i />
              </button>
            ))
          : null}
      </div>
      {loupe}
    </div>
  )
}

/** The arrows under the photo for the selected point (แบบ 2 replaces the tools row with them). */
export function Nudge({
  sel,
  pts,
  shape = 'round',
  onChange,
  onDone,
}: {
  sel: number
  pts: Pt[]
  shape?: NetShape
  onChange: (p: Pt[]) => void
  onDone: () => void
}) {
  const STEP = 0.005
  const move = (dx: number, dy: number) => onChange(pts.map((q, j) => (j === sel ? clampPt({ x: q.x + dx, y: q.y + dy }) : q)))
  const arrows: [string, number, number, number][] = [
    ['เลื่อนขึ้น', 0, 0, -STEP],
    ['เลื่อนลง', 180, 0, STEP],
    ['เลื่อนซ้าย', 270, -STEP, 0],
    ['เลื่อนขวา', 90, STEP, 0],
  ]
  return (
    <div className="nudge w-fade">
      <span>
        ขยับ{rimUnit(shape)}ที่ {sel + 1}
      </span>
      {arrows.map(([label, rot, dx, dy]) => (
        <button key={label} type="button" className="ar" aria-label={label} onClick={() => move(dx, dy)}>
          <Icon n="up" style={{ transform: `rotate(${rot}deg)` }} />
        </button>
      ))}
      <button type="button" className="dn" onClick={onDone}>
        เสร็จ
      </button>
    </div>
  )
}

type ToolsLeft = 'nam' | { guide: string; next: number; shape: NetShape } | { full: string } | { chip: string }

/** The row under the photo: who placed the points (or which one is next), and แตะใหม่. Nothing sits on the photo itself. */
export function RimTools({ left, onAgain }: { left: ToolsLeft | null; onAgain?: () => void }) {
  let l
  if (left === null) l = <span />
  else if (left === 'nam') l = <span className="ychip">น้ำวางให้ · ตรวจแล้วแก้</span>
  else if ('chip' in left) l = <span className="ychip">{left.chip}</span>
  else if ('full' in left)
    l = (
      <span className="full">
        <Icon n="check" />
        {left.full}
      </span>
    )
  else {
    const sq = left.shape === 'square'
    const at = (sq ? [[4, 4], [20, 4], [20, 20], [4, 20]] : [[12, 4], [20, 12], [12, 20], [4, 12]])[left.next] ?? [12, 4]
    l = (
      <span className="guide">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {sq ? (
            <rect x="4" y="4" width="16" height="16" rx="1" fill="none" stroke="#8A899E" strokeWidth="1.5" />
          ) : (
            <circle cx="12" cy="12" r="8" fill="none" stroke="#8A899E" strokeWidth="1.5" />
          )}
          <circle cx={at[0]} cy={at[1]} r="4" fill="#FFD23F" stroke="#C48A12" strokeWidth="1" />
        </svg>
        {left.guide}
      </span>
    )
  }
  return (
    <div className="tools w-fade">
      {l}
      {onAgain ? (
        <button type="button" className="again" onClick={onAgain}>
          <Icon n="redo" />
          แตะใหม่
        </button>
      ) : null}
    </div>
  )
}

/**
 * Grey box, before the first point: a close-up of the top of น้ำ's rim
 * ("ขอบพื้นยอ คือเส้นเหลือง"), or of a square ยอ's top left corner.
 */
export function EdgeHelp({ photoUrl, aspect, rim }: { photoUrl: string; aspect: number; rim: Rim | null }) {
  const r = rim ?? fitRim('round', centredGuess())!
  const boxW = 120
  const boxH = 80
  const f = 0.105
  const bgW = boxW / f
  const bgH = bgW / aspect
  let fx: number
  let fy: number
  if (r.kind === 'ellipse') {
    fx = r.e.cx
    fy = r.e.cy - r.e.ry
  } else {
    // The corner nearest the photo's top left.
    const c = [...r.q].sort((a, b) => a.x + a.y - (b.x + b.y))[0]!
    fx = c.x + 0.04
    fy = c.y + 0.03
  }
  const left = fx * bgW - boxW / 2
  const top = fy * bgH - boxH * (r.kind === 'ellipse' ? 0.2 : 0.5)
  const H = VW / aspect
  const vb = `${((left / bgW) * VW).toFixed(1)} ${((top / bgH) * H).toFixed(1)} ${((boxW / bgW) * VW).toFixed(1)} ${((boxH / bgH) * H).toFixed(1)}`
  const d = r.kind === 'ellipse' ? ellipsePath(r.e, VW, H) : rimPath(r, VW, H)
  return (
    <div className="edge w-fade">
      <span
        className="ec"
        style={{ backgroundImage: `url(${photoUrl})`, backgroundSize: `${bgW.toFixed(0)}px ${bgH.toFixed(0)}px`, backgroundPosition: `${(-left).toFixed(1)}px ${(-top).toFixed(1)}px` }}
      >
        <svg viewBox={vb} preserveAspectRatio="none" aria-hidden="true">
          <path d={d} fill="none" stroke="rgba(10,20,40,.55)" strokeWidth={6} vectorEffect="non-scaling-stroke" />
          <path d={d} fill="none" stroke="#FFD23F" strokeWidth={3} vectorEffect="non-scaling-stroke" />
        </svg>
      </span>
      <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
        <b className="l3">{r.kind === 'ellipse' ? 'ขอบพื้นยอ คือเส้นเหลือง' : 'มุมพื้นยอ คือมุมเส้นเหลือง'}</b>
        <span className="l5 mut">ตรงที่ตาข่ายสีเทาต่อกับผ้าข้าง ไม่ใช่ขอบนอกสุด</span>
      </div>
    </div>
  )
}

/** The rim step's question, by state (แบบ 2). */
function question(shape: NetShape, n: number, ok: boolean, by: 'nam' | 'me' | 'old'): { t: string; d: string } {
  const unit = rimUnit(shape)
  if (n < 4)
    return shape === 'square'
      ? { t: 'แตะมุมพื้นยอ 4 มุม', d: 'แตะตรงมุมที่ตาข่ายพื้นต่อกับผ้าข้างยอ ครบทั้ง 4 มุม' }
      : { t: 'แตะขอบพื้นยอ 4 จุด', d: 'แตะตรงที่ตาข่ายพื้นต่อกับผ้าข้างยอ ให้รอบวง' }
  if (!ok)
    return shape === 'square'
      ? { t: 'มุมยังไม่เป็นสี่เหลี่ยม', d: 'แตะให้ครบ 4 มุมของพื้นยอ หรือแตะใหม่' }
      : { t: 'จุดยังไม่เป็นวง', d: 'แตะให้กระจายรอบยอ บน ขวา ล่าง ซ้าย หรือแตะใหม่' }
  if (by === 'old') return { t: `ขยับ${unit}ให้ตรงขอบพื้นยอ`, d: 'เส้นประขาว คือขอบที่ใช้วัดครั้งก่อน' }
  const how = `ไม่ตรงตรงไหน ลาก${unit}นั้น หรือแตะ${unit}แล้วกดลูกศร`
  return { t: 'เส้นเหลืองตรงขอบพื้นยอไหม', d: by === 'nam' ? `น้ำวางให้ก่อน อาจยังไม่ตรง · ${how}` : how }
}

/**
 * The whole rim step of แบบ 2: the question, the photo, then the tools row
 * (or the arrows while a point is selected), the edge close-up before the
 * first point, and one line of help.
 */
export function RimEditor({
  photoUrl,
  aspect,
  shape = 'round',
  pts,
  onChange,
  guess,
  ghost,
  placedBy = 'nam',
}: {
  photoUrl: string
  aspect: number
  shape?: NetShape
  pts: Pt[]
  onChange: (p: Pt[]) => void
  /** น้ำ's guess, for the edge close-up while placing. */
  guess: Pt[]
  ghost?: Pt[] | null
  placedBy?: 'nam' | 'old'
}) {
  const [sel, setSel] = useState<number | null>(null)
  // After แตะใหม่ the points are the person's own, not น้ำ's guess any more.
  const [own, setOwn] = useState(false)
  const by = own ? 'me' : placedBy
  const rim = pts.length === 4 ? fitRim(shape, pts) : null
  const ok = Boolean(rim)
  const unit = rimUnit(shape)
  const sides = shape === 'square' ? QUAD_SIDES : RIM_SIDES
  const q = question(shape, pts.length, ok, by)
  const picked = sel !== null && sel < pts.length ? sel : null

  const again = () => {
    setSel(null)
    setOwn(true)
    onChange([])
  }

  let left: ToolsLeft
  if (pts.length < 4) left = { guide: `${unit}ที่ ${pts.length + 1} จาก 4 · ${sides[pts.length]}`, next: pts.length, shape }
  else if (by === 'old') left = { chip: 'ขอบเดิม คือเส้นประขาว' }
  else if (by === 'me') left = { full: `ครบ 4 ${unit}แล้ว` }
  else left = 'nam'

  let note: string | null = null
  if (pts.length > 0 && pts.length < 4) note = 'กดค้างแล้วเลื่อนนิ้ว จะมีแว่นขยายให้เห็นขอบชัด ๆ'
  else if (ok && picked === null) note = `แตะ${unit}เหลืองไหนก็ได้ เพื่อขยับทีละนิดด้วยปุ่มลูกศร`

  return (
    <>
      <div className="rq">
        <b className="l2">{q.t}</b>
        <span className="l5 mut">{q.d}</span>
      </div>
      <RimPhoto photoUrl={photoUrl} aspect={aspect} shape={shape} pts={pts} onChange={onChange} sel={picked} onSel={setSel} ghost={ghost} />
      {picked !== null ? (
        <Nudge sel={picked} pts={pts} shape={shape} onChange={onChange} onDone={() => setSel(null)} />
      ) : (
        <RimTools left={pts.length === 4 && !ok ? null : left} onAgain={pts.length ? again : undefined} />
      )}
      {pts.length === 0 ? <EdgeHelp photoUrl={photoUrl} aspect={aspect} rim={fitRim(shape, guess)} /> : null}
      {note ? (
        <div className="w-fade" key={note}>
          <Tip plain>{note}</Tip>
        </div>
      ) : null}
    </>
  )
}
