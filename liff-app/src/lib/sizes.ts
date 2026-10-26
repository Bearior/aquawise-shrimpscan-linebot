/**
 * Shrimp size maths shared by the result, the pond page, the A4 sheets and the
 * mock server. Dependency free.
 *
 * Sizes are counted the way the trade counts them: ตัวต่อกิโล (shrimp per kg).
 * Bigger shrimp means a smaller number, so "ถึงไซส์ 40" means 40 or fewer.
 */

/** ตัว/กก. for a weight in grams. */
export function perKg(grams: number): number {
  return 1000 / grams
}

/** Grams for a ตัว/กก. size. */
export function gramsAt(perKgSize: number): number {
  return 1000 / perKgSize
}

export interface WeightStats {
  n: number
  mean: number
  cv: number
  min: number
  max: number
}

export function weightStats(grams: number[]): WeightStats {
  const n = grams.length
  if (!n) return { n: 0, mean: 0, cv: 0, min: 0, max: 0 }
  const mean = grams.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(grams.reduce((a, g) => a + (g - mean) ** 2, 0) / n)
  return { n, mean, cv: mean ? sd / mean : 0, min: Math.min(...grams), max: Math.max(...grams) }
}

/** The three dot colours on the photo: small, middle, large within THIS net. */
export type Band = 's' | 'm' | 'l'
export const BAND_COLOR: Record<Band, string> = { s: '#8DB6EC', m: '#004AAD', l: '#F08A00' }
export const BAND_LABEL: Record<Band, string> = { s: 'เล็ก', m: 'กลาง', l: 'ใหญ่' }

/** Gram cut points for the dot colours: 15% either side of the mean, rounded. */
export function bandCuts(mean: number): [number, number] {
  return [Math.round(mean * 0.85), Math.round(mean * 1.15)]
}

export function bandOf(g: number, cuts: [number, number]): Band {
  return g < cuts[0] ? 's' : g < cuts[1] ? 'm' : 'l'
}

/** ไซส์เสมอ wording for a CV. */
export function evenness(cv: number): 'เสมอ' | 'เริ่มไม่เสมอ' | 'ไม่เสมอ' {
  return cv < 0.12 ? 'เสมอ' : cv < 0.2 ? 'เริ่มไม่เสมอ' : 'ไม่เสมอ'
}

export function cvPct(cv: number): number {
  return Math.round(cv * 100)
}

/** Size classes are ตัว/กก. ranges between these edges. */
const BASE_EDGES = [35, 40, 45, 50, 60, 70, 80]

/** How the trade writes the gram edge of each size. */
const GRAM_LABEL: Record<number, string> = { 30: '33.3', 35: '28.5', 40: '25', 45: '22', 50: '20', 60: '16.7', 70: '14.3', 80: '12.5' }
function gramLabel(edge: number): string {
  return GRAM_LABEL[edge] ?? (Math.round((1000 / edge) * 10) / 10).toString()
}

/** t reached the target size · n the class right above it (close) · s still small */
export type DistKind = 't' | 'n' | 's'
export const DIST_COLOR: Record<DistKind, string> = { t: '#00706F', n: '#2FA3A3', s: '#6B6A80' }

export interface DistRow {
  label: string
  grams: string
  count: number
  pct: number
  kind: DistKind
}

export interface Distribution {
  rows: DistRow[]
  n: number
  min: number
  max: number
  cv: number
  /** Share that reached the target size, and the share right above it. */
  reachedPct: number
  closePct: number
  /** The class most shrimp are in, as 'ส่วนใหญ่อยู่ที่ 60 ถึง 70'. */
  modal: string
}

export function distribution(grams: number[], target: number): Distribution {
  const edges = [...new Set([...BASE_EDGES, target])].sort((a, b) => a - b)
  type Cls = { lo: number | null; hi: number | null; count: number }
  const classes: Cls[] = []
  classes.push({ lo: null, hi: edges[0]!, count: 0 })
  for (let i = 1; i < edges.length; i++) classes.push({ lo: edges[i - 1]!, hi: edges[i]!, count: 0 })
  classes.push({ lo: edges[edges.length - 1]!, hi: null, count: 0 })

  for (const g of grams) {
    const pk = perKg(g)
    const c = classes.find((k) => (k.lo === null || pk >= k.lo) && (k.hi === null || pk < k.hi))
    if (c) c.count++
  }

  const n = grams.length
  const kindOf = (c: Cls): DistKind =>
    c.hi !== null && c.hi <= target ? 't' : c.lo === target ? 'n' : 's'
  const labelOf = (c: Cls): { label: string; grams: string } =>
    c.lo === null
      ? { label: `ใหญ่กว่า ${c.hi}`, grams: `เกิน ${gramLabel(c.hi!)} ก.` }
      : c.hi === null
        ? { label: `เล็กกว่า ${c.lo}`, grams: `ไม่ถึง ${gramLabel(c.lo)} ก.` }
        : { label: `${c.lo} ถึง ${c.hi}`, grams: `${gramLabel(c.hi)} ถึง ${gramLabel(c.lo)} ก.` }

  const rows: DistRow[] = classes
    .filter((c) => c.count > 0)
    .map((c) => ({ ...labelOf(c), count: c.count, pct: n ? Math.round((c.count / n) * 100) : 0, kind: kindOf(c) }))

  const stats = weightStats(grams)
  const reached = classes.filter((c) => kindOf(c) === 't').reduce((a, c) => a + c.count, 0)
  const close = classes.filter((c) => kindOf(c) === 'n').reduce((a, c) => a + c.count, 0)
  const top = [...classes].sort((a, b) => b.count - a.count)[0]
  return {
    rows,
    n,
    min: stats.min,
    max: stats.max,
    cv: stats.cv,
    reachedPct: n ? Math.round((reached / n) * 100) : 0,
    closePct: n ? Math.round((close / n) * 100) : 0,
    modal: top ? labelOf(top).label : '',
  }
}

/** The one-line read under the distribution. Returns plain text parts so the screen can bold the lead. */
export function distSay(d: Distribution, target: number): { lead: string | null; rest: string; plain: boolean } {
  const even = `ไซส์${evenness(d.cv)} (CV ${cvPct(d.cv)}%)`
  if (d.reachedPct > 0) {
    const close = d.closePct > 0 ? ` อีก ${d.closePct}% ใกล้ถึง` : ''
    const together = d.cv < 0.12 ? ' จับยกบ่อพร้อมกันได้' : ''
    return { lead: `กุ้ง ${d.reachedPct}% ถึงไซส์ ${target} แล้ว`, rest: `${close} · ${even}${together}`, plain: false }
  }
  return { lead: null, rest: `ยังไม่มีตัวไหนถึงไซส์ ${target} · ส่วนใหญ่อยู่ที่ ${d.modal} ตัว/กก. ${even}`, plain: true }
}

/** Lighter than the pond's previous scan by more than the noise: the rim is the usual cause. */
export function isLighter(abw: number, previous: { abw: number } | null | undefined): boolean {
  return Boolean(previous && abw < previous.abw * 0.97)
}

/** Round to one decimal for display. */
export function g1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1)
}
