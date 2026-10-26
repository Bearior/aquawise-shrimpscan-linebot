import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import yor from '@/assets/guide/yor.jpg'
import badCut from '@/assets/guide/bad-cut.jpg'
import badTilt from '@/assets/guide/bad-tilt.jpg'
import badPile from '@/assets/guide/bad-pile.jpg'
import badDark from '@/assets/guide/bad-dark.jpg'
import { api } from '@/api/client'
import type { MeasureRequest, MeasureResponse, Pt, Scan } from '@/api/types'
import { Icon } from './Icon'
import { Head2 } from './ui'
import { RimPhoto } from './rim'

/** Step: how to take the photo. One good example and four that น้ำ cannot measure. */
export function PhotoGuide({ head = true }: { head?: boolean }) {
  const E = { cx: 374.9, cy: 330.3, rx: 280.7, ry: 292.2 }
  const bad: { img: string; t: string; s: string; tag: boolean; shape: ReactNode }[] = [
    {
      img: badCut,
      t: 'ขอบยอไม่ครบวง',
      s: 'ถอยออกมา หรือยกโทรศัพท์ให้สูงขึ้น',
      tag: true,
      shape: (
        <>
          <path d="M4 0V460M0 4H540" stroke="#FF5A3C" strokeWidth={5} vectorEffect="non-scaling-stroke" />
          <ellipse cx={145} cy={183} rx={281} ry={297} fill="none" stroke="#FF5A3C" strokeWidth={2.5} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
        </>
      ),
    },
    {
      img: badTilt,
      t: 'ถ่ายเอียง',
      s: 'ยืนให้ตรงเหนือยอ ถือโทรศัพท์ขนานพื้น',
      tag: false,
      shape: <ellipse cx={322} cy={340} rx={218} ry={182} fill="none" stroke="#FF5A3C" strokeWidth={2.5} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />,
    },
    {
      img: badPile,
      t: 'กุ้งกองทับกัน',
      s: 'เขย่ายอเบา ๆ ให้กุ้งกระจายก่อนถ่าย',
      tag: false,
      shape: <ellipse cx={253} cy={273} rx={150} ry={125} fill="none" stroke="#FF5A3C" strokeWidth={2.5} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />,
    },
    { img: badDark, t: 'มืด หรือ มัว', s: 'ถ่ายตอนมีแสง เช็ดเลนส์ ถือโทรศัพท์นิ่ง ๆ', tag: true, shape: null },
  ]
  return (
    <>
      {head ? <Head2 t="ถ่ายรูปยอให้เหมือนรูปนี้" d="ยกยอพ้นน้ำ แล้วถ่ายตรงลงมาจากด้านบน" /> : null}
      <div className="okp photo" style={{ backgroundImage: `url(${yor})` }}>
        <svg viewBox="0 0 760 674" preserveAspectRatio="none" aria-hidden="true">
          <ellipse {...E} fill="none" stroke="rgba(10,20,40,.55)" strokeWidth={6} vectorEffect="non-scaling-stroke" />
          <ellipse {...E} fill="none" stroke="#FFD23F" strokeWidth={3} strokeDasharray="8 6" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="okb">
          <Icon n="check" />
          ใช้ได้
        </span>
        <span className="okc">
          {['เห็นขอบครบวง', 'ตรงลงมา', 'กุ้งกระจาย'].map((t) => (
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

/** The three phases under the measuring photo. p runs 0..3. */
function Phases({ p }: { p: number }) {
  const ph = (label: string, i: number) => {
    const w = Math.max(0, Math.min(1, p - i)) * 100
    return (
      <div className={w >= 100 ? 'ok' : w > 0 ? 'live' : ''} key={label}>
        <i>
          <b style={{ width: `${w}%` }} />
        </i>
        <span>
          {w >= 100 ? <Icon n="check" /> : null}
          {label}
        </span>
      </div>
    )
  }
  return <div className="phz">{[ph('ปรับภาพให้ตรง', 0), ph('หาตัวกุ้ง', 1), ph('คำนวณน้ำหนัก', 2)]}</div>
}

/**
 * Measuring: outside the ring darkens, the phases move while the request runs,
 * and the found shrimp light up white before the result opens.
 * `found` arrives with the answer; `onShown` fires once it has been seen.
 */
export function Measuring({
  photoUrl,
  aspect,
  rim,
  found,
  onShown,
}: {
  photoUrl: string
  aspect: number
  rim: Pt[]
  found: Pt[] | null
  onShown: () => void
}) {
  const [p, setP] = useState(0)
  const shownRef = useRef(onShown)
  useEffect(() => {
    shownRef.current = onShown
  })

  useEffect(() => {
    // Ease toward 2.8 while waiting: never claims to be done before it is.
    const t = setInterval(() => setP((v) => (v < 2.8 ? v + (2.8 - v) * 0.08 + 0.01 : v)), 120)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!found) return
    const t1 = setTimeout(() => setP(3), 0)
    const t2 = setTimeout(() => shownRef.current(), 700)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [found])

  const dots = found ? found : []
  return (
    <>
      <Head2 t="น้ำกำลังวัดกุ้งในวง" d="ส่วนใหญ่ไม่ถึงนาที อย่าเพิ่งปิดหน้านี้นะคะ" />
      <RimPhoto photoUrl={photoUrl} aspect={aspect} pts={rim} dim={0.72} dots={dots} whiteDots />
      <Phases p={p} />
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

/** Measure, but keep the measuring screen up at least `minMs` so it reads as work, not a flicker. */
export async function measureAtLeast(scanId: string, body: MeasureRequest, minMs = 1600): Promise<MeasureResponse> {
  const t0 = Date.now()
  const r = await api.measure(scanId, body)
  const wait = minMs - (Date.now() - t0)
  if (wait > 0) await new Promise((res) => setTimeout(res, wait))
  return r
}

/** The photo's width over height, from what the browser decoded or what the server measured. */
export function aspectOf(scan: Pick<Scan, 'width' | 'height'>, local?: { width: number; height: number }): number {
  if (local && local.width && local.height) return local.width / local.height
  return scan.width && scan.height ? scan.width / scan.height : 4 / 3
}
