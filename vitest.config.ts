import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // scripts/ is included on purpose: a test that never runs reads as coverage.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    testTimeout: 10000,
  },
})
