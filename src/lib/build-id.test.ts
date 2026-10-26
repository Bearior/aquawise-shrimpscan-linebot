import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBuildId } from './build-id.js'

describe('readBuildId', () => {
  it('reads and trims the file', () => {
    const f = path.join(mkdtempSync(path.join(tmpdir(), 'bid-')), 'build-id')
    writeFileSync(f, '20261026120000\n')
    expect(readBuildId(f)).toBe('20261026120000')
  })

  it('is "unknown" for a missing or empty file, never a throw', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bid-'))
    expect(readBuildId(path.join(dir, 'nope'))).toBe('unknown')
    const f = path.join(dir, 'empty')
    writeFileSync(f, '  \n')
    expect(readBuildId(f)).toBe('unknown')
  })
})
