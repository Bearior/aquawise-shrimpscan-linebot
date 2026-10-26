import { describe, expect, it } from 'vitest'
import { centredGuess, clampPt, ellipsePath, fitEllipse, insideEllipse } from './rim'

describe('fitEllipse', () => {
  it('recovers the ellipse through its 4 axis points', () => {
    const e = fitEllipse([
      { x: 0.5, y: 0.2 },
      { x: 0.8, y: 0.5 },
      { x: 0.5, y: 0.8 },
      { x: 0.2, y: 0.5 },
    ])!
    expect(e.cx).toBeCloseTo(0.5, 6)
    expect(e.cy).toBeCloseTo(0.5, 6)
    expect(e.rx).toBeCloseTo(0.3, 6)
    expect(e.ry).toBeCloseTo(0.3, 6)
  })

  it('handles an off-centre, stretched ring', () => {
    const [cx, cy, rx, ry] = [0.42, 0.55, 0.25, 0.32]
    const pts = [0.3, 1.9, 3.4, 5.1].map((t) => ({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) }))
    const e = fitEllipse(pts)!
    expect(e.cx).toBeCloseTo(cx, 5)
    expect(e.cy).toBeCloseTo(cy, 5)
    expect(e.rx).toBeCloseTo(rx, 5)
    expect(e.ry).toBeCloseTo(ry, 5)
  })

  it('refuses fewer than 4 points, points in a line, and repeated points', () => {
    expect(fitEllipse([{ x: 0.1, y: 0.1 }])).toBeNull()
    expect(
      fitEllipse([
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
        { x: 0.3, y: 0.3 },
        { x: 0.4, y: 0.4 },
      ]),
    ).toBeNull()
    const p = { x: 0.5, y: 0.5 }
    expect(fitEllipse([p, p, p, p])).toBeNull()
  })

  it('fits the neutral guess', () => {
    expect(fitEllipse(centredGuess())).not.toBeNull()
  })
})

describe('helpers', () => {
  it('insideEllipse', () => {
    const e = { cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.1 }
    expect(insideEllipse(e, { x: 0.5, y: 0.5 })).toBe(true)
    expect(insideEllipse(e, { x: 0.69, y: 0.5 })).toBe(true)
    expect(insideEllipse(e, { x: 0.5, y: 0.65 })).toBe(false)
  })

  it('clampPt keeps a point on the photo', () => {
    expect(clampPt({ x: -0.2, y: 1.4 })).toEqual({ x: 0, y: 1 })
  })

  it('ellipsePath draws in pixel space', () => {
    expect(ellipsePath({ cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.25 }, 400, 200)).toBe('M100.0 100.0 A 100.0 50.0 0 1 0 300.0 100.0 A 100.0 50.0 0 1 0 100.0 100.0Z')
  })
})
