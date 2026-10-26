/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Baked build id; the server's /api/liff-config answers the live one. */
  readonly VITE_BUILD_ID?: string
  /** Local UAT outside LINE only: a token the server accepts when ALLOW_DEV_LIFF_AUTH is on. */
  readonly VITE_DEV_LIFF_TOKEN?: string
  /** '1' under `pnpm mock`: the Vite dev server answers /api itself. */
  readonly VITE_MOCK_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
