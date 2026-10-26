/**
 * `/api/liff-config`, fetched once per page load and shared (ported from
 * line-bot). `liff.init()` cannot run until this answers, and until it has run
 * the page may still carry LINE's one-time authorization code in its URL, so a
 * second identical request is a correctness margin lost, not only latency.
 *
 * A failure is NOT cached: a transient network error at boot must not condemn
 * the rest of the page load to running without a LIFF id.
 */
export interface LiffConfigResponse {
  liffId?: string
  /** Build id baked into the deployed image; used by the staleness check. */
  build_id?: string
  /** 'production' | 'staging' | 'development'. */
  env?: string
}

let inflight: Promise<LiffConfigResponse | null> | null = null

export function fetchLiffConfig(fetchFn: typeof fetch = fetch): Promise<LiffConfigResponse | null> {
  if (inflight) return inflight

  const started = (async (): Promise<LiffConfigResponse | null> => {
    try {
      const res = await fetchFn('/api/liff-config', { cache: 'no-store' })
      if (!res.ok) return null
      return (await res.json()) as LiffConfigResponse
    } catch {
      return null
    }
  })()

  inflight = started
  void started.then((v) => {
    if (v === null && inflight === started) inflight = null
  })
  return started
}

/** Tests only: the module-level cache would otherwise leak between cases. */
export function __resetLiffConfigCache(): void {
  inflight = null
}
