/**
 * The ยอ rim between the LIFF and the sizing service.
 *
 * The LIFF holds a rim as 4 points (fractions of the photo) and fits an
 * axis-aligned ellipse through them (liff-app/src/lib/rim.ts: solve4,
 * fitEllipse and fitRing are copied here as they are). The service holds a
 * ring as `[cx/W, cy/H, a/W, b/W, theta]` with `a >= b`: both semi-axes are
 * fractions of the WIDTH, so W and H (the photo's px) are needed to move
 * between the two.
 */

import type { Pt } from '../contract/types.js'
import type { SizingRing, SizingTrayEllipse } from '../lib/sizing.js'

interface Ellipse {
  cx: number
  cy: number
  rx: number
  ry: number
}

/** The LIFF's centredGuess('round'): a centred ring, top, right, bottom, left. */
export const CENTRED_RING: readonly Pt[] = [
  { x: 0.5, y: 0.1 },
  { x: 0.88, y: 0.5 },
  { x: 0.5, y: 0.9 },
  { x: 0.12, y: 0.5 },
]

/** Solve a 4x4 linear system with partial pivoting. Null when singular. */
function solve4(M: number[][], b: number[]): number[] | null {
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

/** The ellipse A·u² + C·v² + D·u + E·v = 1 through the points, with u, v centred on the photo. */
function fitEllipse(pts: Pt[]): Ellipse | null {
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

/** แบบ 2's limits: a ring under about 7% of the photo across is not the ยอ. */
const MIN_R = 0.07
const MAX_R = 1.05

function fitRing(pts: Pt[]): Ellipse | null {
  const e = fitEllipse(pts)
  if (!e || e.rx < MIN_R || e.ry < MIN_R || e.rx > MAX_R || e.ry > MAX_R) return null
  return e
}

/** The service's ellipse through the person's 4 points; null when they make no ring the size of a ยอ. */
export function pointsToEllipse(rim: Pt[], W: number, H: number): SizingTrayEllipse | null {
  const e = fitRing(rim)
  if (!e) return null
  const rxPx = e.rx * W
  const ryPx = e.ry * H
  return rxPx >= ryPx
    ? { cx: e.cx, cy: e.cy, a: rxPx / W, b: ryPx / W, theta: 0 }
    : { cx: e.cx, cy: e.cy, a: ryPx / W, b: rxPx / W, theta: Math.PI / 2 }
}

export function ellipseToRing(e: SizingTrayEllipse): SizingRing {
  return [e.cx, e.cy, e.a, e.b, e.theta]
}

export function ringToEllipse(r: readonly number[]): SizingTrayEllipse {
  return { cx: r[0]!, cy: r[1]!, a: r[2]!, b: r[3]!, theta: r[4]! }
}

/** The 4 points at 0, 90, 180 and 270 degrees round the ellipse, top first, clockwise (the LIFF's RIM_SIDES). */
export function ellipseToPoints(e: SizingTrayEllipse, W: number, H: number): Pt[] {
  const cx = e.cx * W
  const cy = e.cy * H
  const a = e.a * W
  const b = e.b * W
  const cos = Math.cos(e.theta)
  const sin = Math.sin(e.theta)
  // u = (cos, sin) along a, v = (-sin, cos) along b: in y-down px each quarter turn is clockwise on screen.
  const px = [
    { x: cx + a * cos, y: cy + a * sin },
    { x: cx - b * sin, y: cy + b * cos },
    { x: cx - a * cos, y: cy - a * sin },
    { x: cx + b * sin, y: cy - b * cos },
  ]
  const top = px.reduce((best, p, i) => (p.y < px[best]!.y - 1e-9 ? i : best), 0)
  return [0, 1, 2, 3].map((k) => {
    const p = px[(top + k) % 4]!
    return { x: p.x / W, y: p.y / H }
  })
}

export function ringToPoints(ring: readonly number[], W: number, H: number): Pt[] {
  return ellipseToPoints(ringToEllipse(ring), W, H)
}

/**
 * A point on the service's flattened canvas (canvas px) back on the photo
 * (fractions). The service flattens with, in photo px:
 *   s = rimRadiusPx / aPx, rot = [[cos, sin], [-sin, cos]]
 *   A = rotᵀ · diag(s, s·aPx/bPx) · rot, translate = [oc, oc] − A · [cxPx, cyPx], oc = canvasPx / 2
 * so photo px = A⁻¹ · (canvas px − translate) = c + rotᵀ · diag(1/s, bPx/(s·aPx)) · rot · (canvas − [oc, oc]).
 */
export function canvasToPhoto(p: Pt, e: SizingTrayEllipse, rimRadiusPx: number, canvasPx: number, W: number, H: number): Pt {
  const aPx = e.a * W
  const bPx = e.b * W
  const s = rimRadiusPx / aPx
  const oc = canvasPx / 2
  const cos = Math.cos(e.theta)
  const sin = Math.sin(e.theta)
  const dx = p.x - oc
  const dy = p.y - oc
  // rot, then the inverse scale, then rotᵀ.
  const u = (cos * dx + sin * dy) / s
  const v = ((-sin * dx + cos * dy) * bPx) / (s * aPx)
  const x = e.cx * W + cos * u - sin * v
  const y = e.cy * H + sin * u + cos * v
  return { x: x / W, y: y / H }
}
