import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { api } from '@/api/client'
import type { Session } from '@/api/types'
import { useApi } from '@/lib/use-api'
import { ErrorState } from '@/components/ui'
import { LOADING } from '@/copy/th'
import { P } from '@/routes'

interface SessionValue {
  session: Session
  /** After a write that changed who you are or which farm (start, join, target size). */
  setSession: (s: Session) => void
  refresh: () => void
}

const SessionCtx = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const v = useContext(SessionCtx)
  if (!v) throw new Error('useSession outside <SessionGate>')
  return v
}

/** The one screen shown while something boots. */
export function BootScreen({ label = LOADING }: { label?: string }) {
  return (
    <div className="scr liff xl">
      <div className="state" aria-busy="true">
        <span className="nn av-nn breathe" aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  )
}

/** Loads the session once and holds every farm screen until it is known. */
export function SessionGate() {
  const s = useApi(() => api.session())
  const value = useCallback(
    (session: Session): SessionValue => ({ session, setSession: s.setData, refresh: s.reload }),
    [s.setData, s.reload],
  )

  if (!s.data && s.error) {
    return (
      <div className="scr liff xl">
        <ErrorState error={s.error} onRetry={s.reload} />
      </div>
    )
  }
  if (!s.data) return <BootScreen />
  return (
    <SessionCtx.Provider value={value(s.data)}>
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </SessionCtx.Provider>
  )
}

/** Farm screens need a farm: no farm sends you to start (or join, if invited). */
export function RequireFarm({ children }: { children?: ReactNode }) {
  const { session } = useSession()
  const loc = useLocation()
  if (!session.farm) return <Navigate to={P.start + loc.search} replace />
  return children ?? <Outlet />
}

/* ---------- toast ---------- */

interface ToastValue {
  show: (msg: string) => void
  msg: string | null
}
const ToastCtx = createContext<ToastValue>({ show: () => {}, msg: null })

function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((m: string) => {
    setMsg(m)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), 3200)
  }, [])
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  return <ToastCtx.Provider value={{ show, msg }}>{children}</ToastCtx.Provider>
}

export function useToast(): ToastValue {
  return useContext(ToastCtx)
}
