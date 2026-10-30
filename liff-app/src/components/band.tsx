import { useState } from 'react'
import shrimpBand from '@/assets/band/shrimp-band.webp'
import { useLiff } from '@/lib/liff/context'

/**
 * The person's own LINE picture as the door to ตั้งค่า, as on น้องน้ำ's home
 * (line-bot `features/home-v8/components/HomeBand.tsx` ProfileButton). With no
 * picture (a bot the person has not friended hands out none, and the mock has
 * no profile) the first letter of the name stands in.
 */
function ProfileButton({ name, onClick }: { name: string; onClick: () => void }) {
  const { profile } = useLiff()
  const [broken, setBroken] = useState(false)
  const picture = !broken ? profile?.pictureUrl : undefined
  const initial = Array.from((profile?.displayName || name).trim())[0] ?? ''
  return (
    <button type="button" className="band-me" onClick={onClick} aria-label="โปรไฟล์และตั้งค่า" data-testid="band-profile">
      {picture ? <img src={picture} alt="" width={48} height={48} onError={() => setBroken(true)} /> : <b aria-hidden="true">{initial}</b>}
    </button>
  )
}

/**
 * The overview's header band, built the way น้องน้ำ's home band is: AquaWise
 * blue with the shrimp line art top right, the farm name and one line under
 * it, the profile picture on the right, and the blue dissolving into the page
 * over its last 64px. It scrolls with the page. No bell: the OA has no
 * notifications of its own yet (Bear, 2026-10-30).
 */
export function HomeBand({ farmName, sub, userName, onProfile }: { farmName: string; sub: string; userName: string; onProfile: () => void }) {
  return (
    <div className="band" data-testid="home-band">
      <img className="band-art" src={shrimpBand} alt="" aria-hidden="true" />
      <div className="band-row">
        <div className="band-t">
          <h1>{farmName}</h1>
          <span>{sub}</span>
        </div>
        <ProfileButton name={userName} onClick={onProfile} />
      </div>
      <div className="band-fade" aria-hidden="true" />
    </div>
  )
}
