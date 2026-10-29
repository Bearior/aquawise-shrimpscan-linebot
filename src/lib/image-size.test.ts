import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { imageInfo } from './image-size.js'

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../../liff-app/dev-mock/fixtures/${name}`, import.meta.url)))

function png(w: number, h: number): Buffer {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  return b
}

function webp(chunk: 'VP8 ' | 'VP8L' | 'VP8X', w: number, h: number): Buffer {
  const b = Buffer.alloc(40)
  b.write('RIFF', 0, 'ascii')
  b.writeUInt32LE(32, 4)
  b.write('WEBP', 8, 'ascii')
  b.write(chunk, 12, 'ascii')
  if (chunk === 'VP8X') {
    b.writeUIntLE(w - 1, 24, 3)
    b.writeUIntLE(h - 1, 27, 3)
  } else if (chunk === 'VP8 ') {
    Buffer.from([0x9d, 0x01, 0x2a]).copy(b, 23)
    b.writeUInt16LE(w, 26)
    b.writeUInt16LE(h, 28)
  } else {
    b[20] = 0x2f
    const bits = (w - 1) | ((h - 1) << 14)
    b.writeUInt32LE(bits >>> 0, 21)
  }
  return b
}

describe('imageInfo', () => {
  it('reads a JPEG from its SOF marker', () => {
    expect(imageInfo(fixture('yor.jpg'))).toEqual({ type: 'image/jpeg', width: 520, height: 461 })
  })

  it('reads a PNG from IHDR', () => {
    expect(imageInfo(png(1600, 1200))).toEqual({ type: 'image/png', width: 1600, height: 1200 })
  })

  it('reads the three WebP kinds', () => {
    expect(imageInfo(webp('VP8X', 2560, 1920))).toEqual({ type: 'image/webp', width: 2560, height: 1920 })
    expect(imageInfo(webp('VP8 ', 1280, 960))).toEqual({ type: 'image/webp', width: 1280, height: 960 })
    expect(imageInfo(webp('VP8L', 800, 600))).toEqual({ type: 'image/webp', width: 800, height: 600 })
  })

  it('is null for anything else, or a header too short to read', () => {
    expect(imageInfo(Buffer.from('not a jpeg at all'))).toBeNull()
    expect(imageInfo(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull()
    expect(imageInfo(png(0, 10))).toBeNull()
    expect(imageInfo(Buffer.alloc(0))).toBeNull()
  })
})
