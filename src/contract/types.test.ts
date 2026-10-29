import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const norm = (s: string) => s.replace(/\r\n/g, '\n')

describe('the server copy of the LIFF contract', () => {
  // The build's rootDir is src, so the server cannot import liff-app/src/api/types.ts.
  // It keeps a verbatim copy instead; change both files together.
  it('is identical to liff-app/src/api/types.ts', () => {
    const liff = readFileSync(path.resolve(here, '../../liff-app/src/api/types.ts'), 'utf8')
    const server = readFileSync(path.join(here, 'types.ts'), 'utf8')
    expect(norm(server)).toBe(norm(liff))
  })
})
