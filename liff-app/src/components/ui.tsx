import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { ApiAuthError, ApiError, ApiTimeoutError } from '@/lib/api-fetch'
import { ERR } from '@/copy/th'

type BtnKind = 'p' | 's' | 'l' | 'd'

export function Btn({
  kind = 'p',
  icon,
  busy,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; icon?: IconName; busy?: boolean }) {
  return (
    <button
      type="button"
      className={`vbtn ${kind}${busy ? ' busy' : ''}${className ? ` ${className}` : ''}`}
      aria-busy={busy || undefined}
      {...rest}
    >
      {icon ? <Icon n={icon} /> : null}
      {children}
    </button>
  )
}

/** A small rounded button (.mbtn): แก้, ดู, แก้ขอบยอ. */
export function MBtn({ icon, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName }) {
  return (
    <button type="button" className="mbtn" {...rest}>
      {icon ? <Icon n={icon} /> : null}
      {children}
    </button>
  )
}

export function Chip({
  on,
  big,
  onClick,
  children,
  disabled,
}: {
  on?: boolean
  big?: boolean
  onClick?: () => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`cp${on ? ' on' : ''}${big ? ' big' : ''}`}
      aria-pressed={on ? 'true' : 'false'}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`tgl${on ? ' on' : ''}`}
      onClick={() => onChange(!on)}
      disabled={disabled}
    />
  )
}

export function Head2({ t, d }: { t: ReactNode; d?: ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <b className="l2">{t}</b>
      {d ? <span className="l5 mut">{d}</span> : null}
    </div>
  )
}

export function Head3({ t, d }: { t: ReactNode; d?: ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <b className="l3">{t}</b>
      {d ? <span className="l5 mut">{d}</span> : null}
    </div>
  )
}

export function Tip({ children, plain }: { children: ReactNode; plain?: boolean }) {
  return (
    <p className={`tip${plain ? ' plain' : ''}`}>
      <Icon n="info" />
      <span>{children}</span>
    </p>
  )
}

export function OkRow({ children }: { children: ReactNode }) {
  return (
    <div className="okr">
      <Icon n="check" />
      {children}
    </div>
  )
}
export function WarnRow({ children }: { children: ReactNode }) {
  return (
    <div className="wnr">
      <Icon n="warn" />
      {children}
    </div>
  )
}
export function BadRow({ children }: { children: ReactNode }) {
  return (
    <div className="bdr">
      <Icon n="warn" />
      {children}
    </div>
  )
}

export function Saved({ children }: { children: ReactNode }) {
  return (
    <div className="saved" role="status">
      <Icon n="check" />
      {children}
    </div>
  )
}

/** Settings row at large size: name, explanation, control on the right. */
export function XRow({ t, s, right }: { t: ReactNode; s?: ReactNode; right: ReactNode }) {
  return (
    <div className="xsrow">
      <div>
        <b>{t}</b>
        {s ? <span>{s}</span> : null}
      </div>
      {right}
    </div>
  )
}

/** Grey blocks in the shape of the page while it loads. */
export function Skeleton({ rows = [96, 140, 220] }: { rows?: number[] }) {
  return (
    <div style={{ display: 'grid', gap: 14 }} aria-busy="true" aria-label="กำลังโหลด">
      {rows.map((h, i) => (
        <div key={i} className="sk" style={{ height: h }} />
      ))}
    </div>
  )
}

/** What to say about a failed request. */
export function errorText(error: unknown): { title: string; detail?: string; code?: string } {
  if (error instanceof ApiAuthError) return { title: ERR.auth }
  if (error instanceof ApiTimeoutError) return { title: ERR.timeout }
  if (error instanceof ApiError) {
    const code = error.message
    if (error.status === 501 || error.status === 503) return { title: ERR.notReady, detail: ERR.notReadySub, code }
    if (code === 'no_credits') return { title: ERR.noCredits, code }
    if (code === 'not_allowed' || error.status === 403) return { title: ERR.notAllowed, code }
    if (code === 'remeasure_limit') return { title: ERR.remeasureLimit, code }
    return { title: ERR.generic, code: `${error.status} ${code}` }
  }
  if (error instanceof TypeError) return { title: ERR.offline }
  return { title: ERR.generic }
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = errorText(error)
  return (
    <div className="state" role="alert">
      <span className="nn av-nn" aria-hidden="true" />
      <b>{t.title}</b>
      {t.detail ? <span>{t.detail}</span> : null}
      {t.code ? <span className="data">{t.code}</span> : null}
      {onRetry ? (
        <Btn kind="s" icon="redo" onClick={onRetry}>
          {ERR.retry}
        </Btn>
      ) : null}
    </div>
  )
}

/** Inline error under a button, for a write that failed. */
export function InlineError({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <span className="fielderr" role="alert">
      {errorText(error).title}
    </span>
  )
}

export function Pill({ k, children }: { k: 'ok' | 'wn' | 'bd' | 'tl' | 'sf' | 'hr'; children: ReactNode }) {
  return <span className={`pill ${k}`}>{children}</span>
}
