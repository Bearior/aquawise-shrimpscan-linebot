/**
 * A photo's format and pixel size from its header, without decoding it. Ported
 * from the mock store's imageSize() (liff-app/dev-mock/store.ts), with WebP
 * added: the upload accepts JPEG, PNG and WebP, and the rim needs W and H.
 * The format comes from the bytes, never from the Content-Type the client sent.
 */

import type { SizingImageType } from './sizing.js'

export interface ImageInfo {
  type: SizingImageType
  width: number
  height: number
}

const ok = (type: SizingImageType, width: number, height: number): ImageInfo | null =>
  width > 0 && height > 0 ? { type, width, height } : null

function jpeg(b: Buffer): ImageInfo | null {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++
      continue
    }
    const marker = b[i + 1]!
    // SOF0 to SOF15, less DHT (c4), JPG (c8) and DAC (cc), which share the range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return ok('image/jpeg', b.readUInt16BE(i + 7), b.readUInt16BE(i + 5))
    }
    i += 2 + b.readUInt16BE(i + 2)
  }
  return null
}

function webp(b: Buffer): ImageInfo | null {
  if (b.length < 30) return null
  const chunk = b.toString('ascii', 12, 16)
  if (chunk === 'VP8X') return ok('image/webp', 1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3))
  if (chunk === 'VP8 ') return ok('image/webp', b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff)
  if (chunk === 'VP8L' && b[20] === 0x2f) {
    const w = 1 + (b[21]! | ((b[22]! & 0x3f) << 8))
    const h = 1 + ((b[22]! >> 6) | (b[23]! << 2) | ((b[24]! & 0x0f) << 10))
    return ok('image/webp', w, h)
  }
  return null
}

/** Null when the bytes are not a JPEG, PNG or WebP this can read. */
export function imageInfo(b: Buffer): ImageInfo | null {
  if (b.length >= 24 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return ok('image/png', b.readUInt32BE(16), b.readUInt32BE(20))
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) return jpeg(b)
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return webp(b)
  return null
}
