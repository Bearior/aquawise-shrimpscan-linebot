import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { mockApiPlugin } from './dev-mock/mock-api'

/**
 * Stale-bundle build id, read from the FILE the Docker builder writes
 * (`/app/build-id`, i.e. `../build-id` from liff-app/). line-bot learned that
 * an env var does not survive into the Cloud Build vite process; the file does.
 * VITE_BUILD_ID still wins when set (local testing). No file and no env means
 * 'dev', and the client check does nothing.
 */
function resolveBuildId(): string {
  const fromEnv = process.env.VITE_BUILD_ID?.trim()
  if (fromEnv) return fromEnv
  try {
    return readFileSync(path.resolve(__dirname, '../build-id'), 'utf8').trim() || 'dev'
  } catch {
    return 'dev'
  }
}
const BUILD_ID = resolveBuildId()

/** Replaces %VITE_BUILD_ID% in index.html (the inline stale-bundle check). */
function buildIdPlugin(): Plugin {
  return {
    name: 'aw-build-id',
    transformIndexHtml(html) {
      return html.replaceAll('%VITE_BUILD_ID%', BUILD_ID)
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_')
  // `pnpm mock` = `vite --mode mock`, which loads .env.mock (VITE_MOCK_API=1).
  // Serve only: a build never carries the mock, whatever the mode.
  const mock = command === 'serve' && env.VITE_MOCK_API === '1'

  return {
    plugins: [react(), buildIdPlugin(), ...(mock ? [mockApiPlugin()] : [])],
    define: {
      'import.meta.env.VITE_BUILD_ID': JSON.stringify(BUILD_ID),
    },
    base: '/liff/',
    build: {
      outDir: '../public/liff',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          // Stable vendor chunks: a farmer who opens the LIFF every day only
          // re-downloads the small app chunk after a deploy.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('qrcode')) return 'qrcode'
            if (id.includes('@line/liff')) return 'liff'
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router') ||
              id.includes('/scheduler/')
            )
              return 'react-vendor'
            return 'vendor'
          },
        },
      },
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      // With the mock on, the plugin answers /api itself. Otherwise /api goes to
      // the local server (`pnpm dev` in the repo root, port 3000).
      proxy: mock ? undefined : { '/api': 'http://localhost:3000' },
    },
  }
})
