import { describe, expect, it } from 'vitest'
import { centredGuess, clampPt, ellipsePath, fitEllipse, fitQuad, fitRim, fitRing, insideEllipse, insideRim, previewPath, rimArea, rimBox } from './rim'

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

describe('the rim by ยอ shape (แบบ 2)', () => {
  const corners = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ]

  it('puts 4 corners tapped in any order into a frame', () => {
    const shuffled = [corners[2]!, corners[0]!, corners[3]!, corners[1]!]
    const q = fitQuad(shuffled)!
    expect(q).toHaveLength(4)
    expect(rimArea({ kind: 'quad', q })).toBeCloseTo(0.36, 6)
  })

  it('refuses a frame that is not convex, is flat, or is tiny', () => {
    expect(fitQuad([...corners.slice(0, 3), { x: 0.75, y: 0.25 }])).toBeNull()
    expect(fitQuad(corners.map((p) => ({ x: p.x, y: 0.5 })))).toBeNull()
    expect(fitQuad(corners.map((p) => ({ x: 0.5 + (p.x - 0.5) * 0.2, y: 0.5 + (p.y - 0.5) * 0.2 })))).toBeNull()
  })

  it('fits a ring for ยอกลม and a frame for ยอสี่เหลี่ยม', () => {
    expect(fitRim('round', centredGuess('round'))?.kind).toBe('ellipse')
    expect(fitRim('square', centredGuess('square'))?.kind).toBe('quad')
    expect(fitRim('round', [{ x: 0.5, y: 0.5 }])).toBeNull()
  })

  it('refuses a ring smaller than a ยอ could be', () => {
    const tiny = centredGuess('round').map((p) => ({ x: 0.5 + (p.x - 0.5) * 0.1, y: 0.5 + (p.y - 0.5) * 0.1 }))
    expect(fitEllipse(tiny)).not.toBeNull()
    expect(fitRing(tiny)).toBeNull()
  })

  it('knows what is inside a frame and how big its box is', () => {
    const r = fitRim('square', corners)!
    expect(insideRim(r, { x: 0.5, y: 0.5 })).toBe(true)
    expect(insideRim(r, { x: 0.9, y: 0.5 })).toBe(false)
    const b = rimBox(r)
    expect(b.x).toBeCloseTo(0.2, 6)
    expect(b.w).toBeCloseTo(0.6, 6)
  })

  it('draws the 3-point hint: a circle on the photo, or the open frame', () => {
    const three = [
      { x: 0.5, y: 0.1 },
      { x: 0.8, y: 0.5 },
      { x: 0.5, y: 0.9 },
    ]
    expect(previewPath('round', three, 4 / 3, 1000, 750)).toMatch(/^M.* A .*Z$/)
    expect(previewPath('square', three, 4 / 3, 1000, 1000)).toBe('M500.0 100.0 L800.0 500.0 L500.0 900.0')
    expect(previewPath('round', three.slice(0, 2), 4 / 3, 1000, 750)).toBeNull()
    expect(previewPath('round', [three[0]!, { x: 0.5, y: 0.5 }, three[2]!], 4 / 3, 1000, 750)).toBeNull()
  })
})
