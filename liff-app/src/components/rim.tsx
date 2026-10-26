import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { Pt } from '@/api/types'
import { centredGuess, clampPt, ellipsePath, fitEllipse, RIM_SIDES, type Ellipse } from '@/lib/rim'
import { BAND_COLOR, type Band } from '@/lib/sizes'
import { Icon } from './Icon'
import { Tip } from './ui'

/** viewBox width; the height follows the photo's aspect. */
const VW = 1000

export interface RimPhotoProps {
  photoUrl: string
  /** width / height of the photo. */
  aspect: number
  pts: Pt[]
  /** Editable when set. */
  onChange?: (pts: Pt[]) => void
  sel?: number | null
  onSel?: (i: number | null) => void
  /** The rim used last time, dashed white (the fix screen). */
  ghost?: Pt[] | null
  dots?: { x: number; y: number; band?: Band }[]
  whiteDots?: boolean
  dim?: number
}

function ptFrom(e: { clientX: number; clientY: number }, box: DOMRect): Pt {
  return clampPt({ x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height })
}

/**
 * The ยอ photo with the yellow ring, the 4 rim points, the shrimp dots and a
 * magnifier under the finger. Drag a point, or tap one and use the arrows
 * (Nudge). With fewer than 4 points, each tap on the photo adds the next one.
 */
export function RimPhoto({ photoUrl, aspect, pts, onChange, sel = null, onSel, ghost, dots, whiteDots, dim = 0.45 }: RimPhotoProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ i: number; x: number; y: number; moved: boolean } | null>(null)
  const [press, setPress] = useState<Pt | null>(null)
  const [boxSize, setBoxSize] = useState<{ w: number; h: number } | null>(null)

  const H = VW / aspect
  const ell = pts.length === 4 ? fitEllipse(pts) : null
  const d = ell ? ellipsePath(ell, VW, H) : null
  const ghostEll = ghost && ghost.length === 4 ? fitEllipse(ghost) : null
  const editable = Boolean(onChange)

  const rect = () => {
    const r = boxRef.current!.getBoundingClientRect()
    setBoxSize({ w: r.width, h: r.height })
    return r
  }

  const onMarkDown = (e: PointerEvent<HTMLButtonElement>, i: number) => {
    if (!editable) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { i, x: e.clientX, y: e.clientY, moved: false }
    setPress(pts[i]!)
    rect()
  }
  const onMarkMove = (e: PointerEvent<HTMLButtonElement>) => {
    const dr = drag.current
    if (!dr || !onChange) return
    if (!dr.moved && Math.hypot(e.clientX - dr.x, e.clientY - dr.y) < 4) return
    dr.moved = true
    const p = ptFrom(e, rect())
    setPress(p)
    onChange(pts.map((q, j) => (j === dr.i ? p : q)))
  }
  const onMarkUp = () => {
    const dr = drag.current
    drag.current = null
    setPress(null)
    if (!dr) return
    if (!dr.moved) onSel?.(sel === dr.i ? null : dr.i)
    else onSel?.(dr.i)
  }

  const onTapDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!onChange || pts.length >= 4) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setPress(ptFrom(e, rect()))
  }
  const onTapMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!press) return
    setPress(ptFrom(e, rect()))
  }
  const onTapUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!onChange || !press) return
    const p = ptFrom(e, rect())
    setPress(null)
    onChange([...pts, p])
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

  return (
    <div className="r2w">
      <div ref={boxRef} className="r2 photo" style={{ aspectRatio: String(aspect), backgroundImage: `url(${photoUrl})` }}>
        <svg viewBox={`0 0 ${VW} ${H.toFixed(1)}`} preserveAspectRatio="none" aria-hidden="true">
          {d ? (
            <>
              <path d={`M0 0H${VW}V${H.toFixed(1)}H0Z ${d}`} fillRule="evenodd" fill={`rgba(13,12,24,${dim})`} />
              <path d={d} fill="none" stroke="rgba(10,20,40,.55)" strokeWidth={6} vectorEffect="non-scaling-stroke" />
              <path d={d} fill="none" stroke="#FFD23F" strokeWidth={3} vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
          {ghostEll ? (
            <path
              d={ellipsePath(ghostEll, VW, H)}
              fill="none"
              stroke="#fff"
              strokeWidth={2.5}
              strokeDasharray="8 6"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {(dots ?? []).map((q, i) => (
            <circle
              key={i}
              cx={q.x * VW}
              cy={q.y * H}
              r={12}
              fill={whiteDots ? '#fff' : BAND_COLOR[q.band ?? 'm']}
              stroke="#fff"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {editable && pts.length < 4 ? (
          <div
            className="tap"
            role="button"
            tabIndex={-1}
            aria-label="แตะที่ขอบพื้นยอ"
            onPointerDown={onTapDown}
            onPointerMove={onTapMove}
            onPointerUp={onTapUp}
            onPointerCancel={() => setPress(null)}
          />
        ) : null}
        {editable
          ? pts.map((q, i) => (
              <button
                key={i}
                type="button"
                className={`mk${i === sel ? ' on' : ''}`}
                style={{ left: `${(q.x * 100).toFixed(2)}%`, top: `${(q.y * 100).toFixed(2)}%` }}
                aria-label={`จุดที่ ${i + 1}${i === sel ? ' เลือกอยู่' : ''}`}
                aria-pressed={i === sel}
                onPointerDown={(e) => onMarkDown(e, i)}
                onPointerMove={onMarkMove}
                onPointerUp={onMarkUp}
                onPointerCancel={() => {
                  drag.current = null
                  setPress(null)
                }}
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

/** The arrows under the photo for the selected point. */
export function Nudge({ sel, pts, onChange, onDone }: { sel: number; pts: Pt[]; onChange: (p: Pt[]) => void; onDone: () => void }) {
  const STEP = 0.004
  const move = (dx: number, dy: number) =>
    onChange(pts.map((q, j) => (j === sel ? clampPt({ x: q.x + dx, y: q.y + dy }) : q)))
  const arrows: [string, number, number, number][] = [
    ['เลื่อนขึ้น', 0, 0, -STEP],
    ['เลื่อนลง', 180, 0, STEP],
    ['เลื่อนซ้าย', 270, -STEP, 0],
    ['เลื่อนขวา', 90, STEP, 0],
  ]
  return (
    <div className="nudge">
      <span>ขยับจุดที่ {sel + 1}</span>
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

/** The row under the photo: who placed the points, and แตะใหม่. */
export function RimTools({ left, onAgain }: { left: 'nam' | { guide: string } | { full: string } | { chip: string }; onAgain?: () => void }) {
  let l
  if (left === 'nam') l = <span className="ychip">น้ำวางให้ · ตรวจแล้วแก้</span>
  else if ('chip' in left) l = <span className="ychip">{left.chip}</span>
  else if ('full' in left)
    l = (
      <span className="full">
        <Icon n="check" />
        {left.full}
      </span>
    )
  else
    l = (
      <span className="guide">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="none" stroke="#8A899E" strokeWidth="1.5" />
          <circle cx="12" cy="20" r="4" fill="#FFD23F" stroke="#C48A12" strokeWidth="1" />
        </svg>
        {left.guide}
      </span>
    )
  return (
    <div className="tools">
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

/** Grey box: "ขอบพื้นยอ คือเส้นเหลือง", a close-up of the top of the rim. */
export function EdgeHelp({ photoUrl, aspect, ell }: { photoUrl: string; aspect: number; ell: Ellipse | null }) {
  const e = ell ?? fitEllipse(centredGuess())!
  const boxW = 120
  const boxH = 80
  const f = 0.105
  const bgW = boxW / f
  const bgH = bgW / aspect
  const left = e.cx * bgW - boxW / 2
  const top = (e.cy - e.ry) * bgH - boxH * 0.2
  const H = VW / aspect
  const vb = `${((left / bgW) * VW).toFixed(1)} ${((top / bgH) * H).toFixed(1)} ${((boxW / bgW) * VW).toFixed(1)} ${((boxH / bgH) * H).toFixed(1)}`
  const d = ellipsePath(e, VW, H)
  return (
    <div className="edge">
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
        <b className="l3">ขอบพื้นยอ คือเส้นเหลือง</b>
        <span className="l5 mut">ตรงที่ตาข่ายสีเทาต่อกับผ้าข้าง ไม่ใช่ขอบนอกสุด</span>
      </div>
    </div>
  )
}

/**
 * The whole rim step: the photo, the tools row, and either the arrows, the
 * hint, or (while placing) the side to tap next and the edge help.
 */
export function RimEditor({
  photoUrl,
  aspect,
  pts,
  onChange,
  guess,
  ghost,
  placedBy = 'nam',
}: {
  photoUrl: string
  aspect: number
  pts: Pt[]
  onChange: (p: Pt[]) => void
  /** น้ำ's guess, to show the edge help while placing. */
  guess: Pt[]
  ghost?: Pt[] | null
  placedBy?: 'nam' | 'old'
}) {
  const [sel, setSel] = useState<number | null>(null)
  // After แตะใหม่ the points are the person's own, not น้ำ's guess any more.
  const [own, setOwn] = useState(false)
  const placing = pts.length < 4
  const ell = !placing ? fitEllipse(pts) : null

  return (
    <>
      <RimPhoto photoUrl={photoUrl} aspect={aspect} pts={pts} onChange={onChange} sel={sel} onSel={setSel} ghost={ghost} />
      {placing ? (
        <>
          <RimTools
            left={{ guide: `จุดที่ ${pts.length + 1} จาก 4 · ${RIM_SIDES[pts.length]}` }}
            onAgain={pts.length ? () => onChange([]) : undefined}
          />
          <EdgeHelp photoUrl={photoUrl} aspect={aspect} ell={fitEllipse(guess)} />
          <Tip plain>กดค้างแล้วเลื่อนนิ้ว จะมีแว่นขยายให้เห็นขอบชัด ๆ</Tip>
        </>
      ) : (
        <>
          <RimTools
            left={placedBy === 'old' && !own ? { chip: 'ขอบเดิม คือเส้นประขาว' } : own ? { full: 'ครบ 4 จุดแล้ว' } : 'nam'}
            onAgain={() => {
              setSel(null)
              setOwn(true)
              onChange([])
            }}
          />
          {!ell ? <span className="fielderr">จุดยังไม่เป็นวง ลองแตะใหม่นะคะ</span> : null}
          {sel !== null ? (
            <Nudge sel={sel} pts={pts} onChange={onChange} onDone={() => setSel(null)} />
          ) : (
            <Tip plain>แตะจุดเหลืองไหนก็ได้ เพื่อขยับทีละนิดด้วยปุ่มลูกศร</Tip>
          )}
          {placedBy === 'old' ? <EdgeHelp photoUrl={photoUrl} aspect={aspect} ell={ell} /> : null}
        </>
      )}
    </>
  )
}
