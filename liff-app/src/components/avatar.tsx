import { useState } from 'react'

/** Words that come before a name in a farm ('ลุงพล', 'พี่ชาติ', 'ช่างเอก'): the letter is the name's, not theirs. */
const PREFIXES = ['ลุง', 'ป้า', 'น้า', 'อา', 'พี่', 'น้อง', 'บัง', 'ช่าง', 'นาย', 'นาง', 'คุณ', 'ตา', 'ยาย']
/** Thai vowels written before the consonant they follow: the letter is the consonant. */
const LEADING = /^[เแโใไ]/

/** The one letter a person's circle shows: 'ลุงพล' is พ, 'Bear' is B. */
export function initialOf(name: string): string {
  let s = name.trim()
  for (const p of PREFIXES) {
    if (s.length > p.length && s.startsWith(p)) {
      s = s.slice(p.length)
      break
    }
  }
  if (LEADING.test(s)) s = s.slice(1)
  return (Array.from(s)[0] ?? '').toUpperCase()
}

/** A steady colour per name, so a person is the same colour on every page. */
export function toneOf(name: string): number {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 5
}

/**
 * The person's circle: their LINE picture when there is one, else their
 * first letter on one of five soft tints. A picture LINE no longer serves
 * falls back to the letter.
 */
export function Ava({ name, size, src }: { name: string; size?: number; src?: string | null }) {
  const [broken, setBroken] = useState<string | null>(null)
  const picture = src && src !== broken ? src : null
  return (
    <span
      className={`ava c${toneOf(name)}${picture ? ' pic' : ''}`}
      style={size ? { width: size, height: size, fontSize: Math.round(size * 0.42) } : undefined}
      aria-hidden="true"
    >
      {picture ? <img src={picture} alt="" loading="lazy" onError={() => setBroken(picture)} /> : initialOf(name)}
    </span>
  )
}
