import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import yor from '@/assets/guide/yor.jpg'
import okSquare from '@/assets/guide/ok-square.jpg'
import badCut from '@/assets/guide/bad-cut.jpg'
import badCutSquare from '@/assets/guide/bad-cut-square.jpg'
import badTilt from '@/assets/guide/bad-tilt.jpg'
import badPile from '@/assets/guide/bad-pile.jpg'
import badDark from '@/assets/guide/bad-dark.jpg'
import badDarkSquare from '@/assets/guide/bad-dark-square.jpg'
import type { NetShape, Pt, Scan } from '@/api/types'
import { fitRim, rimBox, rimPath } from '@/lib/rim'
import { BAND_COLOR, type Band } from '@/lib/sizes'
import { usePrefersReducedMotion } from '@/lib/motion'
import { Icon } from './Icon'
import { Head2 } from './ui'
import { VW } from './rim'

const RED = { fill: 'none', stroke: '#FF5A3C', strokeWidth: 2.5, strokeDasharray: '6 5', vectorEffect: 'non-scaling-stroke' } as const

/** Step: how to take the photo. One good example and four that น้ำ cannot measure (แบบ 2, by ยอ shape). */
export function PhotoGuide({ head = true, shape = 'round' }: { head?: boolean; shape?: NetShape }) {
  const sq = shape === 'square'
  const E = { cx: 374.9, cy: 330.3, rx: 280.7, ry: 292.2 }
  const SQ_OK = '84.7,53.8 526.9,61.0 537.6,505.8 58.3,492.3'
  const bad: { img: string; t: string; s: string; tag: boolean; shape: ReactNode }[] = [
    sq
      ? {
          img: badCutSquare,
          t: 'มุมยอไม่ครบ 4 มุม',
          s: 'ถอยออกมา หรือยกโทรศัพท์ให้สูงขึ้น',
          tag: true,
          shape: (
            <>
              <path d="M4 0V478M0 4H600" stroke="#FF5A3C" strokeWidth={5} vectorEffect="non-scaling-stroke" />
              <polygon points="-99.3,-116.6 500.8,-106.8 515.2,496.8 -135.2,478.5" strokeLinejoin="round" {...RED} />
            </>
          ),
        }
      : {
          img: badCut,
          t: 'ขอบยอไม่ครบวง',
          s: 'ถอยออกมา หรือยกโทรศัพท์ให้สูงขึ้น',
          tag: true,
          shape: (
            <>
              <path d="M4 0V460M0 4H540" stroke="#FF5A3C" strokeWidth={5} vectorEffect="non-scaling-stroke" />
              <ellipse cx={145} cy={183} rx={281} ry={297} {...RED} />
            </>
          ),
        },
    {
      img: badTilt,
      t: 'ถ่ายเอียง',
      s: 'ยืนให้ตรงเหนือยอ ถือโทรศัพท์ขนานพื้น',
      tag: false,
      shape: <ellipse cx={322} cy={340} rx={218} ry={182} {...RED} />,
    },
    {
      img: badPile,
      t: 'กุ้งกองทับกัน',
      s: 'เขย่ายอเบา ๆ ให้กุ้งกระจายก่อนถ่าย',
      tag: false,
      shape: <ellipse cx={253} cy={273} rx={150} ry={125} {...RED} />,
    },
    { img: sq ? badDarkSquare : badDark, t: 'มืด หรือ มัว', s: 'ถ่ายตอนมีแสง เช็ดเลนส์ ถือโทรศัพท์นิ่ง ๆ', tag: true, shape: null },
  ]
  return (
    <>
      {head ? <Head2 t="ถ่ายรูปยอให้เหมือนรูปนี้" d="ยกยอพ้นน้ำ แล้วถ่ายตรงลงมาจากด้านบน" /> : null}
      <div className="okp photo" style={{ backgroundImage: `url(${sq ? okSquare : yor})` }}>
        {sq ? (
          <svg viewBox="0 0 600 532" preserveAspectRatio="none" aria-hidden="true">
            <polygon points={SQ_OK} fill="none" stroke="rgba(10,20,40,.55)" strokeWidth={6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <polygon points={SQ_OK} fill="none" stroke="#FFD23F" strokeWidth={3} strokeDasharray="8 6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <svg viewBox="0 0 760 674" preserveAspectRatio="none" aria-hidden="true">
            <ellipse {...E} fill="none" stroke="rgba(10,20,40,.55)" strokeWidth={6} vectorEffect="non-scaling-stroke" />
            <ellipse {...E} fill="none" stroke="#FFD23F" strokeWidth={3} strokeDasharray="8 6" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <span className="okb">
          <Icon n="check" />
          ใช้ได้
        </span>
        {sq ? <span className="ptag okt">ภาพประกอบ</span> : null}
        <span className="okc">
          {[sq ? 'เห็นครบ 4 มุม' : 'เห็นขอบครบวง', 'ตรงลงมา', 'กุ้งกระจาย'].map((t) => (
            <span key={t}>
              <Icon n="check" />
              {t}
            </span>
          ))}
        </span>
      </div>
      <b className="l3" style={{ marginTop: 4 }}>
        แบบนี้น้ำวัดไม่ได้
      </b>
      <div className="bgrid">
        {bad.map((b) => (
          <figure key={b.t}>
            <span className="bp photo" style={{ backgroundImage: `url(${b.img})` }}>
              <svg viewBox="0 0 600 532" preserveAspectRatio="none" aria-hidden="true">
                {b.shape}
              </svg>
              <span className="bx">
                <Icon n="x" />
              </span>
              {b.tag ? <span className="ptag">ภาพประกอบ</span> : null}
            </span>
            <figcaption>
              <b>{b.t}</b>
              <span>{b.s}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  )
}

/** The three phases under the measuring photo, each 0..1. */
function Phases({ w }: { w: [number, number, number] }) {
  const labels = ['ปรับภาพให้ตรง', 'หาตัวกุ้ง', 'คำนวณน้ำหนัก']
  return (
    <div className="phz">
      {labels.map((label, i) => {
        const v = Math.max(0, Math.min(1, w[i]!))
        return (
          <div className={v >= 1 ? 'ok' : v > 0 ? 'live' : ''} key={label}>
            <i>
              <b style={{ width: `${(v * 100).toFixed(1)}%` }} />
            </i>
            <span>
              {v >= 1 ? <Icon n="check" /> : null}
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** แบบ 2's measuring beats, in ms: straighten, sweep once round the rim, weigh. */
const PREP = 600
const SWEEP = 2200
const CALC = 800

/** How far "หาตัวกุ้ง" creeps while the answer is still on its way: never past about a third. */
function wait(ms: number): number {
  return ms > PREP ? 0.35 * (1 - Math.exp(-(ms - PREP) / 4000)) : 0
}

/** Where the waiting sweep points at this moment, in degrees clockwise from 12 o'clock. */
function turn(ms: number): number {
  return ((((ms - PREP) / SWEEP) * 360) % 360 + 360) % 360
}

/** Clockwise from 12 o'clock, in degrees, on the photo as seen (width / height = aspect). */
function angleOf(p: Pt, c: Pt, aspect: number): number {
  const a = (Math.atan2((p.x - c.x) * aspect, -(p.y - c.y)) * 180) / Math.PI
  return (a + 360) % 360
}

/**
 * Measuring (แบบ 2): outside the rim darkens, a yellow sweep turns inside it,
 * and once น้ำ's answer is in, each shrimp lights up white as the sweep
 * passes it, then takes its size colour while the weight is worked out.
 * While the answer is still on its way the sweep keeps turning and nothing is
 * claimed done. `shrimp` arrives with the answer; `onShown` fires once it has
 * been seen. Under reduced motion the dots and the result come at once.
 */
export function Measuring({
  photoUrl,
  aspect,
  shape = 'round',
  rim,
  shrimp,
  onShown,
}: {
  photoUrl: string
  aspect: number
  shape?: NetShape
  rim: Pt[]
  shrimp: { x: number; y: number; band: Band }[] | null
  onShown: () => void
}) {
  const reduced = usePrefersReducedMotion()
  const [t, setT] = useState(0)
  const tRef = useRef(0)
  // When the answer came: the reveal start, the sweep angle then, and how far "หาตัวกุ้ง" had crept.
  const [arrived, setArrived] = useState<{ at: number; a: number; b: number } | null>(null)
  const shownRef = useRef(onShown)
  useEffect(() => {
    shownRef.current = onShown
  })

  useEffect(() => {
    if (reduced) return
    let raf = 0
    let t0: number | null = null
    const tick = (now: number) => {
      if (t0 === null) t0 = now
      tRef.current = now - t0
      setT(tRef.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  useEffect(() => {
    if (!shrimp || arrived) return
    const now = tRef.current
    // An answer before the sweep starts reveals from the top; a later one from wherever the sweep is.
    const timer = setTimeout(() => setArrived(now > PREP ? { at: now, a: turn(now), b: wait(now) } : { at: PREP, a: 0, b: 0 }), 0)
    return () => clearTimeout(timer)
  }, [shrimp, arrived])

  const doneAt = arrived ? arrived.at + SWEEP + CALC : null
  const done = reduced ? Boolean(shrimp) : doneAt !== null && t >= doneAt
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => shownRef.current(), 0)
    return () => clearTimeout(timer)
  }, [done])

  const fit = fitRim(shape, rim)
  const H = VW / aspect
  const d = fit ? rimPath(fit, VW, H) : null
  const box = fit ? rimBox(fit) : null
  const mid = box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : { x: 0.5, y: 0.5 }

  let dots: { x: number; y: number; fill: string }[] = []
  let sweep: number | null = null
  let phases: [number, number, number]
  if (reduced) {
    dots = (shrimp ?? []).map((s) => ({ x: s.x, y: s.y, fill: BAND_COLOR[s.band] }))
    phases = shrimp ? [1, 1, 1] : [0, 0, 0]
  } else if (arrived) {
    const prog = Math.max(0, Math.min(1, (t - arrived.at) / SWEEP))
    const coloured = t >= arrived.at + SWEEP
    dots = (shrimp ?? [])
      .filter((s) => prog >= 1 || (t >= arrived.at && (angleOf(s, mid, aspect) - arrived.a + 360) % 360 <= prog * 360))
      .map((s) => ({ x: s.x, y: s.y, fill: coloured ? BAND_COLOR[s.band] : '#FFFFFF' }))
    if (prog < 1 && t > PREP) sweep = (arrived.a + prog * 360) % 360
    phases = [t / PREP, Math.max(arrived.b, prog), (t - arrived.at - SWEEP) / CALC]
  } else {
    if (t > PREP) sweep = turn(t)
    phases = [t / PREP, wait(t), 0]
  }

  let clip = 'border-radius: 50%'
  if (fit && fit.kind === 'quad' && box) {
    clip = `polygon(${fit.q.map((p) => `${(((p.x - box.x) / box.w) * 100).toFixed(2)}% ${(((p.y - box.y) / box.h) * 100).toFixed(2)}%`).join(', ')})`
  }

  return (
    <>
      <Head2 t={`น้ำกำลังวัดกุ้งใน${shape === 'square' ? 'กรอบ' : 'วง'}`} d="ส่วนใหญ่ไม่ถึงนาที อย่าเพิ่งปิดหน้านี้นะคะ" />
      <div className="r2w">
        <div className="r2 photo" style={{ aspectRatio: String(aspect), backgroundImage: `url(${photoUrl})` }} role="img" aria-label="รูปยอที่กำลังวัด จุดคือกุ้งที่น้ำเจอแล้ว">
          <svg viewBox={`0 0 ${VW} ${H.toFixed(1)}`} preserveAspectRatio="none" aria-hidden="true">
            {d ? (
              <>
                <path className="mdim" d={`M0 0H${VW}V${H.toFixed(1)}H0Z ${d}`} fillRule="evenodd" style={{ fill: `rgba(13,12,24,${reduced || t > 300 ? 0.72 : 0.45})` }} />
                <path d={d} fill="none" stroke="#FFD23F" strokeWidth={3} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </>
            ) : null}
            {dots.map((q, i) => (
              <circle
                key={i}
                className="w-pop mdot"
                cx={q.x * VW}
                cy={q.y * H}
                r={10.5}
                stroke="#fff"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                style={{ fill: q.fill }}
              />
            ))}
          </svg>
          {sweep !== null && box ? (
            <span
              className="sweep"
              aria-hidden="true"
              style={{
                left: `${(box.x * 100).toFixed(2)}%`,
                top: `${(box.y * 100).toFixed(2)}%`,
                width: `${(box.w * 100).toFixed(2)}%`,
                height: `${(box.h * 100).toFixed(2)}%`,
                ...(fit?.kind === 'quad' ? { clipPath: clip } : { borderRadius: '50%' }),
                background: `conic-gradient(from ${sweep.toFixed(1)}deg, rgba(255,210,63,0) 0deg, rgba(255,210,63,0) 290deg, rgba(255,210,63,.5) 360deg)`,
              }}
            />
          ) : null}
        </div>
      </div>
      <Phases w={phases} />
    </>
  )
}

/**
 * Shrink a phone photo before upload: 12 MB over rural 3G is minutes. The long
 * edge stays at 2560 px, plenty for the rim and the shrimp. Falls back to the
 * original file when the browser cannot decode it.
 */
export async function prepPhoto(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(file)
    const long = Math.max(bmp.width, bmp.height)
    const k = Math.min(1, 2560 / long)
    const w = Math.round(bmp.width * k)
    const h = Math.round(bmp.height * k)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9))
    if (blob) return { blob, width: w, height: h }
  } catch {
    /* fall through to the original */
  }
  return { blob: file, width: 0, height: 0 }
}

/** The two hidden file inputs behind ถ่ายรูปยอ and เลือกรูปจากเครื่องแทน. */
export function usePhotoPicker(onFile: (f: File) => void) {
  const cam = useRef<HTMLInputElement>(null)
  const gal = useRef<HTMLInputElement>(null)
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) onFile(f)
  }
  const inputs = (
    <>
      <input ref={cam} className="vh" type="file" accept="image/*" capture="environment" onChange={onChange} tabIndex={-1} aria-hidden="true" />
      <input ref={gal} className="vh" type="file" accept="image/*" onChange={onChange} tabIndex={-1} aria-hidden="true" data-testid="photo-file" />
    </>
  )
  return { inputs, openCamera: () => cam.current?.click(), openGallery: () => gal.current?.click() }
}

/** The photo's width over height, from what the browser decoded or what the server measured. */
export function aspectOf(scan: Pick<Scan, 'width' | 'height'>, local?: { width: number; height: number }): number {
  if (local && local.width && local.height) return local.width / local.height
  return scan.width && scan.height ? scan.width / scan.height : 4 / 3
}
