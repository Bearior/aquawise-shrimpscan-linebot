/**
 * Who the backend-free mock (`pnpm mock`) pretends you are.
 *
 * `?as=owner|manager|worker|new|fresh` on any URL picks a persona and keeps it for the
 * tab. Only `pnpm mock` reads it: everywhere else MOCK is false and this module
 * sends nothing, so a real server never sees the header.
 */
// A plain && (no Boolean()) so a build folds it to false and drops the mock code.
export const MOCK: boolean = import.meta.env.DEV && import.meta.env.VITE_MOCK_API === '1'

export type MockPersona = 'owner' | 'manager' | 'worker' | 'new' | 'fresh'
const PERSONAS: MockPersona[] = ['owner', 'manager', 'worker', 'new', 'fresh']
const KEY = 'aw_scan_mock_persona'

export function mockPersona(): MockPersona {
  if (!MOCK) return 'owner'
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('as')
    if (fromUrl && (PERSONAS as string[]).includes(fromUrl)) {
      sessionStorage.setItem(KEY, fromUrl)
      return fromUrl as MockPersona
    }
    const saved = sessionStorage.getItem(KEY)
    if (saved && (PERSONAS as string[]).includes(saved)) return saved as MockPersona
  } catch {
    /* storage blocked: default persona */
  }
  return 'owner'
}

export function setMockPersona(p: MockPersona): void {
  try {
    sessionStorage.setItem(KEY, p)
  } catch {
    /* ignore */
  }
}

export function mockPersonaHeader(): Record<string, string> {
  return MOCK ? { 'x-mock-persona': mockPersona() } : {}
}
