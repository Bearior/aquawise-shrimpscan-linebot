/**
 * LIFF API transport (ported from line-bot's liff-api-client).
 *
 * Every `/api/*` call carries `Authorization: Bearer <id token>` from
 * `liff.getIDToken()` (access token as the fallback). The body never carries a
 * LINE user id: the server derives identity from the verified token only.
 */
import liff from '@line/liff'
import { mockPersonaHeader } from './mock-persona'

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /** ms before the request is aborted; `null` waits forever (model calls only). */
  timeoutMs?: number | null
}

/** Generous on purpose: it bounds the pathological case, not a slow network. */
const DEFAULT_TIMEOUT_MS = 20_000

export class ApiTimeoutError extends Error {
  readonly timeoutMs: number
  constructor(timeoutMs: number) {
    super(`request timed out after ${timeoutMs}ms`)
    this.timeoutMs = timeoutMs
    this.name = 'ApiTimeoutError'
  }
}

export class ApiAuthError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`API auth failed (${status})`)
    this.status = status
    this.name = 'ApiAuthError'
  }
}

/** Non-2xx with the parsed body. `message` is the server's `error` code. */
export class ApiError extends Error {
  readonly status: number
  readonly body: Record<string, unknown>
  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === 'string' ? body.error : `HTTP ${status}`)
    this.status = status
    this.body = body
    this.name = 'ApiError'
  }
}

/** `AbortSignal.any` is missing on some LINE webviews this ships to. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const native = (AbortSignal as { any?: (s: AbortSignal[]) => AbortSignal }).any
  if (typeof native === 'function') return native.call(AbortSignal, signals)
  const ctrl = new AbortController()
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort(s.reason)
      break
    }
    s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true })
  }
  return ctrl.signal
}

export function getLiffAuthToken(): string | null {
  // Dev-only bypass for local UAT outside LINE; compiled out of builds.
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_LIFF_TOKEN) {
    return import.meta.env.VITE_DEV_LIFF_TOKEN as string
  }
  try {
    const idToken = liff.getIDToken()
    if (idToken) return idToken
    const accessToken = liff.getAccessToken()
    if (accessToken) return accessToken
  } catch {
    /* LIFF not initialised (tests): no header */
  }
  return null
}

function authHeaders(): Record<string, string> {
  const token = getLiffAuthToken()
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...mockPersonaHeader() }
}

async function readError(res: Response): Promise<never> {
  if (res.status === 401) throw new ApiAuthError(401)
  const body = (await res.json().catch(() => ({ error: 'request_failed' }))) as Record<string, unknown>
  throw new ApiError(res.status, body)
}

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const headers: Record<string, string> = authHeaders()
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const timer = timeoutMs === null ? null : AbortSignal.timeout(timeoutMs)
  const composed = timer && signal ? anySignal([signal, timer]) : (timer ?? signal)

  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: composed,
    })
  } catch (err) {
    if (timer?.aborted && !signal?.aborted) throw new ApiTimeoutError(timeoutMs as number)
    throw err
  }
  if (!res.ok) return readError(res)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** Binary upload (a photo), body kept byte for byte with its real MIME type. */
export async function apiUpload<T>(path: string, body: Blob, options: { contentType: string; signal?: AbortSignal }): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': options.contentType },
    body,
    signal: options.signal,
  })
  if (!res.ok) return readError(res)
  return res.json() as Promise<T>
}
