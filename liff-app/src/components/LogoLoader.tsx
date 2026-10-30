/**
 * LogoLoader: the AquaWise logo as the app's waiting mark, the same component
 * as line-bot's `components/data-display/LogoLoader.tsx` (Bear, 2026-10-30:
 * "use same component as line-bot nongnam"). The logo lands out of a soft
 * blur, then breathes, scaling up 4% and back, until the screen is ready.
 *
 * ONE clock for every logo. index.html draws the same logo before any script
 * runs (#aw-boot) and stamps when it started (`window.__awLogoT0`); a
 * LogoLoader that mounts while a logo is up, or within HANDOFF_MS of one
 * going, carries on from that clock through negative animation delays. So the
 * boot logo, the sign-in wait and the session wait read as one logo
 * breathing, not a new landing at each hand-off.
 *
 * Decorative: the caller carries role="status" and the words a screen reader
 * hears. Reduced motion shows the logo still.
 */

import { useEffect, useState } from 'react'
import logoBlue from '@/assets/brand/aquawise-logo-blue.webp'
import { usePrefersReducedMotion } from '@/lib/motion'

declare global {
  interface Window {
    /** performance.now() when index.html's boot logo started (see index.html). */
    __awLogoT0?: number
    /** performance.now() when the boot logo was taken down; unset while it is up. */
    __awLogoOff?: number
  }
}

/** Same names and frames as index.html's boot logo, so either sheet can run it. */
const KEYFRAMES_ID = 'aw-logo-loader'
const KEYFRAMES =
  '@keyframes awLogoIn{from{opacity:0;transform:scale(.72);filter:blur(6px)}}' + '@keyframes awLogoBreathe{to{transform:scale(1.04)}}'
const LAND_MS = 800
const BREATHE_MS = 1400
const EASE_LAND = 'cubic-bezier(.16,1,.3,1)'
/** A logo gone for less than this still counts as on screen for the next one. */
const HANDOFF_MS = 400
/** The art is 600x143. */
const ASPECT = 143 / 600

function ensureKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById(KEYFRAMES_ID)) return
  const el = document.createElement('style')
  el.id = KEYFRAMES_ID
  el.textContent = KEYFRAMES
  document.head.appendChild(el)
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

let clockT0: number | null = null
let mounted = 0
let offSince = 0

/** When the logo that is (or was just) on screen started landing. */
function claimClock(): number {
  const t = now()
  if (clockT0 === null && typeof window !== 'undefined' && typeof window.__awLogoT0 === 'number') {
    clockT0 = window.__awLogoT0
    // The boot logo is still up while __awLogoOff is unset.
    offSince = window.__awLogoOff ?? t
  }
  if (clockT0 === null || (mounted === 0 && t - offSince > HANDOFF_MS)) clockT0 = t
  return clockT0
}

export function LogoLoader({ width = 200 }: { width?: number }) {
  ensureKeyframes()
  const reduced = usePrefersReducedMotion()
  const [elapsed] = useState(() => Math.round(now() - claimClock()))

  useEffect(() => {
    mounted += 1
    return () => {
      mounted -= 1
      if (mounted === 0) offSince = now()
    }
  }, [])

  return (
    <img
      src={logoBlue}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-testid="logo-loader"
      width={width}
      height={Math.round(width * ASPECT)}
      style={{
        display: 'block',
        width,
        height: 'auto',
        flexShrink: 0,
        userSelect: 'none',
        animation: reduced
          ? undefined
          : `awLogoIn ${LAND_MS}ms ${EASE_LAND} ${-elapsed}ms both, ` +
            `awLogoBreathe ${BREATHE_MS}ms ease-in-out ${LAND_MS - elapsed}ms infinite alternate`,
      }}
    />
  )
}
