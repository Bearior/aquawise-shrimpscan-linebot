/**
 * The ยอ rim, as แบบ 2 of the ขอบยอ canvas fits it: the axis-aligned ellipse
 * through 4 points the person places on the floor edge of the net.
 *
 * Everything is in normalized photo units (0..1 of width and height). An
 * axis-aligned ellipse stays axis-aligned when each axis is scaled, so fitting
 * in normalized space and drawing at any pixel size give the same ring.
 *
 * Dependency free: the mock server imports it too.
 */
import type { NetShape, Pt } from '../api/types'

/**
 * ยอสี่เหลี่ยม is held back (Bear, 2026-10-29): the shared database keeps no
 * ยอ shape yet, so every ยอ is round. The geometry below still handles both;
 * only the screens that choose a shape read this.
 */
export const SQUARE_NET_ENABLED: boolean = false

/** The shapes a person may choose, in card order. */
export const NET_SHAPES: readonly NetShape[] = SQUARE_NET_ENABLED ? ['round', 'square'] : ['round']

export interface Ellipse {
  cx: number
  cy: number
  rx: number
  ry: number
}

/** Solve a 4x4 linear system with partial pivoting. Null when singular. */
export function solve4(M: number[][], b: number[]): number[] | null {
  const A = M.map((r, i) => [...r, b[i]!])
  for (let c = 0; c < 4; c++) {
    let p = c
    for (let r = c + 1; r < 4; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r
    if (Math.abs(A[p]![c]!) < 1e-12) return null
    const tmp = A[c]!
    A[c] = A[p]!
    A[p] = tmp
    for (let r = 0; r < 4; r++) {
      if (r === c) continue
      const f = A[r]![c]! / A[c]![c]!
      for (let k = c; k <= 4; k++) A[r]![k]! -= f * A[c]![k]!
    }
  }
  return A.map((r, i) => r[4]! / r[i]!)
}

/**
 * The ellipse A·u² + C·v² + D·u + E·v = 1 through the points (least squares
 * when more than 4), with u, v centred on the photo. Null when the points do
 * not make an ellipse (3 in a line, two on top of each other).
 */
export function fitEllipse(pts: Pt[]): Ellipse | null {
  if (pts.length < 4) return null
  const U = 0.5
  const V = 0.5
  const N = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
  const r = [0, 0, 0, 0]
  for (const p of pts) {
    const u = (p.x - U) / U
    const v = (p.y - V) / V
    const a = [u * u, v * v, u, v]
    for (let i = 0; i < 4; i++) {
      r[i]! += a[i]!
      for (let j = 0; j < 4; j++) N[i]![j]! += a[i]! * a[j]!
    }
  }
  const s = solve4(N, r)
  if (!s) return null
  const [A, C, D, E] = s as [number, number, number, number]
  if (!(A > 0) || !(C > 0)) return null
  const G = 1 + (D * D) / (4 * A) + (E * E) / (4 * C)
  if (!(G > 0)) return null
  const e = {
    cx: U - (D / (2 * A)) * U,
    cy: V - (E / (2 * C)) * V,
    rx: Math.sqrt(G / A) * U,
    ry: Math.sqrt(G / C) * V,
  }
  if (![e.cx, e.cy, e.rx, e.ry].every(Number.isFinite)) return null
  return e
}

/** SVG path of the ellipse in a w x h coordinate space. */
export function ellipsePath(e: Ellipse, w: number, h: number): string {
  const cx = e.cx * w
  const cy = e.cy * h
  const rx = e.rx * w
  const ry = e.ry * h
  const a = ` ${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 `
  return `M${(cx - rx).toFixed(1)} ${cy.toFixed(1)} A${a}${(cx + rx).toFixed(1)} ${cy.toFixed(1)} A${a}${(cx - rx).toFixed(1)} ${cy.toFixed(1)}Z`
}

/** Is the point inside the ellipse? */
export function insideEllipse(e: Ellipse, p: Pt): boolean {
  const dx = (p.x - e.cx) / e.rx
  const dy = (p.y - e.cy) / e.ry
  return dx * dx + dy * dy <= 1
}

/** Clamp a point onto the photo. */
export function clampPt(p: Pt): Pt {
  return { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) }
}

/**
 * Which side of the rim the next point should go, for "จุดที่ 3 จาก 4 · ด้านล่าง".
 * Points are asked for clockwise from the top; a square ยอ's corners from the
 * top left.
 */
export const RIM_SIDES = ['ด้านบน', 'ด้านขวา', 'ด้านล่าง', 'ด้านซ้าย'] as const
export const QUAD_SIDES = ['ซ้ายบน', 'ขวาบน', 'ขวาล่าง', 'ซ้ายล่าง'] as const

/** จุด on a ยอกลม, มุม on a ยอสี่เหลี่ยม. */
export function rimUnit(shape: NetShape): 'จุด' | 'มุม' {
  return shape === 'square' ? 'มุม' : 'จุด'
}

/** A neutral first guess when nothing better is known: a centred ring, or a centred frame. */
export function centredGuess(shape: NetShape = 'round'): Pt[] {
  if (shape === 'square') {
    return [
      { x: 0.12, y: 0.1 },
      { x: 0.88, y: 0.1 },
      { x: 0.88, y: 0.9 },
      { x: 0.12, y: 0.9 },
    ]
  }
  return [
    { x: 0.5, y: 0.1 },
    { x: 0.88, y: 0.5 },
    { x: 0.5, y: 0.9 },
    { x: 0.12, y: 0.5 },
  ]
}

/* ---------- the rim by ยอ shape (แบบ 2: ยอกลม is a ring, ยอสี่เหลี่ยม a 4-corner frame) ---------- */

export type Rim = { kind: 'ellipse'; e: Ellipse } | { kind: 'quad'; q: Pt[] }
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** แบบ 2's limits: a ring under about 7% of the photo across is not the ยอ, nor is a frame under about 3% of its area. */
const MIN_R = 0.07
const MAX_R = 1.05
const MIN_QUAD_AREA = 0.028

/** The ring through the 4 points, when it is a ring the size of a ยอ. */
export function fitRing(pts: Pt[]): Ellipse | null {
  const e = fitEllipse(pts)
  if (!e || e.rx < MIN_R || e.ry < MIN_R || e.rx > MAX_R || e.ry > MAX_R) return null
  return e
}

/**
 * Four corners in any tap order, put in turn around their middle. Null unless
 * they make a convex frame of some size.
 */
export function fitQuad(pts: Pt[]): Pt[] | null {
  if (pts.length !== 4) return null
  const mx = pts.reduce((a, p) => a + p.x, 0) / 4
  const my = pts.reduce((a, p) => a + p.y, 0) / 4
  const q = [...pts].sort((a, b) => Math.atan2(a.y - my, a.x - mx) - Math.atan2(b.y - my, b.x - mx))
  let sign = 0
  let area = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]!
    const b = q[(i + 1) % 4]!
    const c = q[(i + 2) % 4]!
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cr) < 1e-6) return null
    if (sign && Math.sign(cr) !== sign) return null
    sign = Math.sign(cr)
    area += a.x * b.y - b.x * a.y
  }
  if (Math.abs(area) / 2 < MIN_QUAD_AREA) return null
  return q
}

/** The rim the 4 points make for this ยอ shape, or null while they make none. */
export function fitRim(shape: NetShape, pts: Pt[]): Rim | null {
  if (shape === 'square') {
    const q = fitQuad(pts)
    return q ? { kind: 'quad', q } : null
  }
  const e = fitRing(pts)
  return e ? { kind: 'ellipse', e } : null
}

export function quadPath(q: Pt[], w: number, h: number): string {
  return `M${q.map((p) => `${(p.x * w).toFixed(1)} ${(p.y * h).toFixed(1)}`).join(' L')} Z`
}

/** SVG path of the rim in a w x h coordinate space. */
export function rimPath(r: Rim, w: number, h: number): string {
  return r.kind === 'ellipse' ? ellipsePath(r.e, w, h) : quadPath(r.q, w, h)
}

/** The rim's bounding box, in photo units. */
export function rimBox(r: Rim): Box {
  if (r.kind === 'ellipse') return { x: r.e.cx - r.e.rx, y: r.e.cy - r.e.ry, w: 2 * r.e.rx, h: 2 * r.e.ry }
  const xs = r.q.map((p) => p.x)
  const ys = r.q.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** Area in photo units (width x height = 1). */
export function rimArea(r: Rim): number {
  if (r.kind === 'ellipse') return Math.PI * r.e.rx * r.e.ry
  let a = 0
  for (let i = 0; i < 4; i++) {
    const p = r.q[i]!
    const n = r.q[(i + 1) % 4]!
    a += p.x * n.y - n.x * p.y
  }
  return Math.abs(a) / 2
}

export function insideRim(r: Rim, p: Pt): boolean {
  if (r.kind === 'ellipse') return insideEllipse(r.e, p)
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = r.q[i]!
    const b = r.q[(i + 1) % 4]!
    const cr = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (cr === 0) continue
    if (sign && Math.sign(cr) !== sign) return false
    sign = Math.sign(cr)
  }
  return true
}

/**
 * The dashed hint once 3 points are down: the circle through them on a ยอกลม
 * (a circle on the photo, so it needs the photo's width / height), or the
 * open frame on a ยอสี่เหลี่ยม. Null when the 3 points make no circle.
 */
export function previewPath(shape: NetShape, pts: Pt[], aspect: number, w: number, h: number): string | null {
  if (pts.length !== 3) return null
  if (shape === 'square') return `M${pts.map((p) => `${(p.x * w).toFixed(1)} ${(p.y * h).toFixed(1)}`).join(' L')}`
  // In pixel-like units (width = aspect, height = 1) the circle is round.
  const [a, b, c] = pts.map((p) => ({ x: p.x * aspect, y: p.y })) as [Pt, Pt, Pt]
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-9) return null
  const A2 = a.x * a.x + a.y * a.y
  const B2 = b.x * b.x + b.y * b.y
  const C2 = c.x * c.x + c.y * c.y
  const x = (A2 * (b.y - c.y) + B2 * (c.y - a.y) + C2 * (a.y - b.y)) / d
  const y = (A2 * (c.x - b.x) + B2 * (a.x - c.x) + C2 * (b.x - a.x)) / d
  const r = Math.hypot(a.x - x, a.y - y)
  if (r > 1.2) return null
  return ellipsePath({ cx: x / aspect, cy: y, rx: r / aspect, ry: r }, w, h)
}
