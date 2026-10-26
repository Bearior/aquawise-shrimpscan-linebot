import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import liff from '@line/liff'
import { initLiff } from './init'
import { attemptLoginOrRecover, consumeOnceWithinTtl, resetLoginGuard, stripRetryMarker } from './login-guard'
import { checkBuildFreshness } from './build-version'

export interface LiffState {
  isReady: boolean
  isInClient: boolean
  /** True when the SDK did not boot (no LIFF id, or init failed). */
  sdkMissing: boolean
  profile: { displayName: string; pictureUrl?: string } | null
}

const LiffContext = createContext<LiffState>({ isReady: false, isInClient: false, sdkMissing: false, profile: null })

/** Boot may take this long before we render anyway (a stuck spinner is nobody's job). */
const BOOT_TIMEOUT_MS = 15_000

/** Local UAT outside LINE: the dev-token sentinel skips the SDK entirely. Compiled out of builds. */
export function devBypassActive(): boolean {
  return Boolean(import.meta.env.DEV && import.meta.env.VITE_DEV_LIFF_TOKEN)
}

export function LiffProvider({ children }: { children: ReactNode }) {
  const bypass = devBypassActive()
  const [state, setState] = useState<LiffState>(() => ({
    isReady: bypass,
    isInClient: false,
    sdkMissing: bypass,
    profile: null,
  }))

  useEffect(() => {
    // Self-heal a stale LINE-cached bundle first. No-op in dev ('dev' id).
    void checkBuildFreshness()
    if (bypass) return

    let settled = false
    const ready = (patch: Partial<LiffState> = {}) => {
      settled = true
      clearTimeout(bootTimer)
      setState((s) => ({ ...s, ...patch, isReady: true }))
    }
    const bootTimer = setTimeout(() => {
      if (settled) return
      console.warn('[LIFF] boot did not settle in time; rendering so the screen is not stuck')
      setState((s) => ({ ...s, isReady: true }))
    }, BOOT_TIMEOUT_MS)

    initLiff()
      .then(async (ok) => {
        if (!ok) {
          ready({ sdkMissing: true })
          return
        }
        const inClient = liff.isInClient()

        // NEVER liff.login() inside the LINE client (line-bot's filmed loop):
        // in-client the person is authenticated by definition, so a missing
        // login there is a configuration fault that redirects cannot fix.
        if (!liff.isLoggedIn()) {
          if (inClient) {
            console.warn('[LIFF] in-client but not logged in; rendering instead of redirecting')
            ready({ isInClient: true })
            return
          }
          if (attemptLoginOrRecover() === 'redirecting') {
            settled = true
            clearTimeout(bootTimer)
            return
          }
          ready({ isInClient: false })
          return
        }

        resetLoginGuard()
        stripRetryMarker()

        // Logged in but no ID token: the session predates the openid scope. One
        // re-login outside the client can pick it up; in-client it would loop.
        if (!liff.getIDToken() && !inClient && consumeOnceWithinTtl('aw_scan_liff_token_refresh')) {
          settled = true
          clearTimeout(bootTimer)
          liff.login({ redirectUri: window.location.href })
          return
        }
        if (!liff.getIDToken() && inClient) {
          console.warn('[LIFF] in-client with no ID token; check the LIFF app openid scope')
        }

        ready({ isInClient: inClient })
        try {
          const p = await liff.getProfile()
          setState((s) => ({ ...s, profile: { displayName: p.displayName, pictureUrl: p.pictureUrl } }))
        } catch {
          /* profile can fail outside the client; the server knows the name anyway */
        }
      })
      .catch((err) => {
        console.error('[LIFF] init failed:', err)
        ready({ sdkMissing: true })
      })

    return () => clearTimeout(bootTimer)
  }, [bypass])

  return <LiffContext.Provider value={state}>{children}</LiffContext.Provider>
}

export function useLiff(): LiffState {
  return useContext(LiffContext)
}
