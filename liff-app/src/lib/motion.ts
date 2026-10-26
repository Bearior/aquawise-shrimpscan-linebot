/**
 * Motion, as Day's LIFF Design Guideline decides it (MO1, line-bot
 * `lib/design-tokens.ts` MOTION and `lib/motion/*`): light, short, never a
 * wait. Press 120, select 160, fade 180, step 240, bar 240, height 300.
 * Enter eases out, settle is cubic-bezier(.2,.8,.2,1), exit leaves fast.
 * No running numbers, no shake, no looping coachmark.
 *
 * The scan screens add the few moves แบบ 2 of the ขอบยอ canvas draws
 * (docs/shrimp-scan-rim-redesign/M2.dc.html): the shutter flash, the rim ring
 * drawing on, the rim points popping in, and the measuring sweep.
 *
 * Nothing rests on a transform or an opacity below 1: CSS keyframes run with
 * `backwards` fill (only before they start) and WAAPI with no fill, so the
 * element hands back to the stylesheet when the move ends. Under
 * prefers-reduced-motion every move is a cut.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export const MOTION = {
  dur: {
    press: 120,
    select: 160,
    fade: 180,
    step: 240,
    bar: 240,
    pop: 260,
    height: 300,
    draw: 420,
    flash: 240,
  },
  ease: {
    standard: 'cubic-bezier(.2,.8,.2,1)',
    enter: 'ease-out',
    exit: 'cubic-bezier(.4,0,1,1)',
  },
  /** A step's content slides this far in from the side. */
  stepPx: 24,
} as const

const QUERY = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(QUERY)
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

/**
 * The step move (MO1): when `step` changes, the element's new content comes
 * in from 24px right (forward) or left (back) with a fade over 240 ms, and
 * the scroll goes back to the top. Same step = no move.
 */
export function useStepMotion<T extends HTMLElement>(step: number | null) {
  const ref = useRef<T>(null)
  const prev = useRef(step)
  const reduced = usePrefersReducedMotion()
  useLayoutEffect(() => {
    const from = prev.current
    prev.current = step
    const el = ref.current
    if (from === null || step === null || from === step || !el) return
    el.scrollTop = 0
    if (reduced || typeof el.animate !== 'function') return
    const dx = step > from ? MOTION.stepPx : -MOTION.stepPx
    const anim = el.animate(
      [
        { transform: `translateX(${dx}px)`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: MOTION.dur.step, easing: MOTION.ease.enter },
    )
    return () => anim.cancel()
  }, [step, reduced])
  return ref
}

/** True for `ms` after `fire()`: the shutter flash over the photo step. */
export function useBlink(ms: number = MOTION.dur.flash): [boolean, () => void] {
  const [on, setOn] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (t.current) clearTimeout(t.current)
    },
    [],
  )
  const fire = () => {
    if (prefersReducedMotion()) return
    if (t.current) clearTimeout(t.current)
    setOn(true)
    t.current = setTimeout(() => setOn(false), ms)
  }
  return [on, fire]
}
