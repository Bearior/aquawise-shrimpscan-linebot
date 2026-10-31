import { useState } from 'react'
import cameraBand from '@/assets/band/camera-band.webp'
import pondBand from '@/assets/band/pond-band.webp'
import shrimpBand from '@/assets/band/shrimp-band.webp'
import { useLiff } from '@/lib/liff/context'

/** The line art top right: one drawing a tab, all in the shrimp's one blue (the pond and the camera made by Codex's image_gen from it). */
const ART = { shrimp: shrimpBand, pond: pondBand, camera: cameraBand } as const
export type BandArt = keyof typeof ART

/**
 * The person's own LINE picture as the door to ตั้งค่า, as on น้องน้ำ's home
 * (line-bot `features/home-v8/components/HomeBand.tsx` ProfileButton). With no
 * picture (a bot the person has not friended hands out none, and the mock has
 * no profile) the first letter of the name stands in.
 */
function ProfileButton({ name, onClick }: { name: string; onClick?: () => void }) {
  const { profile } = useLiff()
  const [broken, setBroken] = useState(false)
  const picture = !broken ? profile?.pictureUrl : undefined
  const initial = Array.from((profile?.displayName || name).trim())[0] ?? ''
  const face = picture ? <img src={picture} alt="" width={48} height={48} onError={() => setBroken(true)} /> : <b aria-hidden="true">{initial}</b>
  // A worker has no ตั้งค่า: the picture is only theirs to see.
  if (!onClick) {
    return (
      <span className="band-me" aria-hidden="true">
        {face}
      </span>
    )
  }
  return (
    <button type="button" className="band-me" onClick={onClick} aria-label="โปรไฟล์และตั้งค่า" data-testid="band-profile">
      {face}
    </button>
  )
}

/**
 * The tab pages' header band, built the way น้องน้ำ's home band is: AquaWise
 * blue with line art top right (the shrimp on ภาพรวม, a pond on รายบ่อ, a
 * camera on สแกนวันนี้: Bear, 2026-10-31), the title and one line under it,
 * the profile picture on the right, and the blue dissolving into the page
 * over its last 64px. It scrolls with the page. No bell: the OA has no
 * notifications of its own yet (Bear, 2026-10-30).
 */
export function Band({ art, title, sub, userName, onProfile }: { art: BandArt; title: string; sub: string; userName: string; onProfile?: () => void }) {
  return (
    <div className={`band art-${art}`} data-testid={`band-${art}`}>
      <img className="band-art" src={ART[art]} alt="" aria-hidden="true" />
      <div className="band-row">
        <div className="band-t">
          <h1>{title}</h1>
          <span>{sub}</span>
        </div>
        <ProfileButton name={userName} onClick={onProfile} />
      </div>
      <div className="band-fade" aria-hidden="true" />
    </div>
  )
}
