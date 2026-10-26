import { useCallback, useEffect, useState } from 'react'

export interface ApiState<T> {
  data: T | null
  error: unknown
  loading: boolean
  /** Fetch again; the current data stays on screen meanwhile. */
  reload: () => void
  /** Replace the data in place after a write that returned it. */
  setData: (d: T) => void
}

interface Answer<T> {
  /** The key the answer belongs to, and the reload tick it answered. */
  key: string
  tick: number
  data: T | null
  error: unknown
}

/**
 * Load one thing for a screen. A change in `key` (a pond id) refetches, and
 * only the answer for the current key is shown, so a fast tap through ponds
 * never shows the wrong pond. A reload keeps the old data up until it lands.
 */
export function useApi<T>(load: () => Promise<T>, key: unknown[] = []): ApiState<T> {
  const keyStr = JSON.stringify(key)
  const [tick, setTick] = useState(0)
  const [answer, setAnswer] = useState<Answer<T> | null>(null)

  useEffect(() => {
    let live = true
    load()
      .then((data) => {
        if (live) setAnswer({ key: keyStr, tick, data, error: null })
      })
      .catch((error: unknown) => {
        if (live) setAnswer((a) => ({ key: keyStr, tick, data: a && a.key === keyStr ? a.data : null, error }))
      })
    return () => {
      live = false
    }
    // `load` is a fresh closure every render; the key is what identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyStr, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  const setData = useCallback((data: T) => setAnswer({ key: keyStr, tick, data, error: null }), [keyStr, tick])

  const mine = answer && answer.key === keyStr ? answer : null
  return {
    data: mine?.data ?? null,
    error: mine && mine.tick === tick ? mine.error : null,
    loading: !mine || mine.tick !== tick,
    reload,
    setData,
  }
}
