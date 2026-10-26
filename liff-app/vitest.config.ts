import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    // Node by default; a component test opts into jsdom by being a .tsx file.
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    include: ['src/**/*.test.{ts,tsx}', 'dev-mock/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
