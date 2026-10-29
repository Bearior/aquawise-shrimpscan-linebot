import { describe, expect, it } from 'vitest'
import type { Pt } from '../contract/types.js'
import { CENTRED_RING, canvasToPhoto, ellipseToPoints, ellipseToRing, pointsToEllipse, ringToPoints } from './rim-geometry.js'

const W = 1000
const H = 800

/** 4 points of an axis-aligned ellipse in px, top, right, bottom, left, as photo fractions. */
function rimOf(cxPx: number, cyPx: number, rxPx: number, ryPx: number): Pt[] {
  return [
    { x: cxPx / W, y: (cyPx - ryPx) / H },
    { x: (cxPx + rxPx) / W, y: cyPx / H },
    { x: cxPx / W, y: (cyPx + ryPx) / H },
    { x: (cxPx - rxPx) / W, y: cyPx / H },
  ]
}

function expectPts(got: Pt[], want: Pt[]) {
  expect(got).toHaveLength(want.length)
  got.forEach((p, i) => {
    expect(p.x, `x${i}`).toBeCloseTo(want[i]!.x, 6)
    expect(p.y, `y${i}`).toBeCloseTo(want[i]!.y, 6)
  })
}

/** Where a photo point (fractions) sits against the ellipse: 1 on the rim. */
function onRim(p: Pt, e: { cx: number; cy: number; a: number; b: number; theta: number }): number {
  const dx = p.x * W - e.cx * W
  const dy = p.y * H - e.cy * H
  const u = dx * Math.cos(e.theta) + dy * Math.sin(e.theta)
  const v = -dx * Math.sin(e.theta) + dy * Math.cos(e.theta)
  return (u / (e.a * W)) ** 2 + (v / (e.b * W)) ** 2
}

describe('pointsToEllipse', () => {
  it('a circle of radius 0.4 W on a 1000 x 800 photo is a = b = 0.4 of the width, centred', () => {
    const e = pointsToEllipse(rimOf(500, 400, 400, 400), W, H)!
    expect(e.cx).toBeCloseTo(0.5, 9)
    expect(e.cy).toBeCloseTo(0.5, 9)
    expect(e.a).toBeCloseTo(0.4, 9)
    expect(e.b).toBeCloseTo(0.4, 9)
    expect(e.theta).toBe(0)
  })

  it('a ring taller than wide keeps a >= b, turned a quarter', () => {
    const e = pointsToEllipse(rimOf(480, 420, 250, 340), W, H)!
    expect(e.a).toBeCloseTo(0.34, 9)
    expect(e.b).toBeCloseTo(0.25, 9)
    expect(e.theta).toBeCloseTo(Math.PI / 2, 9)
  })

  it('points that make no ring are null', () => {
    expect(pointsToEllipse([{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }, { x: 0.4, y: 0.4 }], W, H)).toBeNull()
    expect(pointsToEllipse(rimOf(500, 400, 20, 20), W, H)).toBeNull()
  })
})

describe('ellipseToPoints and ringToPoints', () => {
  it('round-trips the 4 points, top, right, bottom, left', () => {
    for (const rim of [rimOf(500, 400, 400, 400), rimOf(480, 420, 250, 340), rimOf(530, 380, 360, 300)]) {
      const e = pointsToEllipse(rim, W, H)!
      expectPts(ellipseToPoints(e, W, H), rim)
      expectPts(ringToPoints(ellipseToRing(e), W, H), rim)
    }
  })

  it('a turned ellipse still starts at its top point and goes clockwise', () => {
    const pts = ellipseToPoints({ cx: 0.5, cy: 0.5, a: 0.3, b: 0.2, theta: 0.4 }, W, H)
    const ys = pts.map((p) => p.y)
    expect(Math.min(...ys)).toBe(ys[0])
    expect(pts[1]!.x).toBeGreaterThan(pts[3]!.x)
    expect(pts[2]!.y).toBeGreaterThan(pts[0]!.y)
  })

  it('the centred guess is the LIFF one', () => {
    expect(CENTRED_RING).toEqual([
      { x: 0.5, y: 0.1 },
      { x: 0.88, y: 0.5 },
      { x: 0.5, y: 0.9 },
      { x: 0.12, y: 0.5 },
    ])
  })
})

describe('canvasToPhoto', () => {
  const canvasPx = 1024
  const oc = canvasPx / 2
  const R = 480

  for (const e of [
    { cx: 0.5, cy: 0.5, a: 0.4, b: 0.4, theta: 0 },
    { cx: 0.48, cy: 0.55, a: 0.36, b: 0.3, theta: 0.3 },
  ]) {
    it(`maps the canvas centre to the ellipse centre and the canvas rim onto the rim (theta ${e.theta})`, () => {
      const c = canvasToPhoto({ x: oc, y: oc }, e, R, canvasPx, W, H)
      expect(c.x).toBeCloseTo(e.cx, 9)
      expect(c.y).toBeCloseTo(e.cy, 9)
      for (const p of [{ x: oc + R, y: oc }, { x: oc, y: oc - R }, { x: oc - R * Math.SQRT1_2, y: oc + R * Math.SQRT1_2 }]) {
        expect(onRim(canvasToPhoto(p, e, R, canvasPx, W, H), e)).toBeCloseTo(1, 9)
      }
    })
  }
})
