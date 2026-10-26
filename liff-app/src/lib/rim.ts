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
import type { Pt } from '../api/types'

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
 * Points are asked for clockwise from the top.
 */
export const RIM_SIDES = ['ด้านบน', 'ด้านขวา', 'ด้านล่าง', 'ด้านซ้าย'] as const

/** A neutral first guess when nothing better is known: a centred ring. */
export function centredGuess(): Pt[] {
  return [
    { x: 0.5, y: 0.1 },
    { x: 0.88, y: 0.5 },
    { x: 0.5, y: 0.9 },
    { x: 0.12, y: 0.5 },
  ]
}
