import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { closeLiff } from '@/lib/liff-actions'
import { useStepMotion } from '@/lib/motion'
import { useSession, useToast } from '@/session'
import { P } from '@/routes'

export type NavKey = 'overview' | 'ponds' | 'team' | 'people' | 'today'

const NAV: [NavKey, IconName, string, string][] = [
  ['overview', 'grid', 'ภาพรวม', P.overview],
  ['ponds', 'chart', 'รายบ่อ', P.ponds],
  ['team', 'list', 'สแกนวันนี้', P.team],
  ['people', 'users', 'คนในฟาร์ม', P.people],
]

/** A worker's two tabs, while they see their ponds (Bear, 2026-10-31). */
const WORKER_NAV: [NavKey, IconName, string, string][] = [
  ['today', 'list', 'สแกนวันนี้', P.today],
  ['ponds', 'chart', 'บ่อที่ดูแล', P.ponds],
]

interface PageProps {
  title?: ReactNode
  sub?: ReactNode
  /** A path, or a function for an in-page step back. */
  back?: string | (() => void)
  /** Show the ✕ that closes the LIFF back to the chat. */
  close?: boolean
  step?: [number, number]
  foot?: ReactNode
  /** Two buttons side by side in the footer. */
  two?: boolean
  nav?: NavKey
  /** Replaces the plain top bar (the blue overview header, the people header). */
  top?: ReactNode
  /** Sheets and dims over the page. */
  over?: ReactNode
  /** The white shutter flash over the whole screen, while true. */
  flash?: boolean
  children: ReactNode
}

/** Close the LIFF; outside LINE (the mock, a browser) go to the app's home instead. */
export function useCloseLiff(): () => void {
  const navigate = useNavigate()
  return () => {
    if (!closeLiff()) navigate(P.home)
  }
}

/** Segments under the header, "ขั้นที่ X/Y" at their right end (Day's H2 and SF1). */
function StepBar({ x, y }: { x: number; y: number }) {
  return (
    <div className="sb" role="progressbar" aria-label={`ขั้นที่ ${x} จาก ${y}`} aria-valuemin={1} aria-valuemax={y} aria-valuenow={x}>
      <div className="seg" aria-hidden="true">
        {Array.from({ length: y }, (_, i) => (
          <i key={i} className={i < x ? 'on' : ''}>
            <b />
          </i>
        ))}
      </div>
      <span aria-hidden="true">
        ขั้นที่ {x}/{y}
      </span>
    </div>
  )
}

export function Page({ title, sub, back, close, step, foot, two, nav, top, over, flash, children }: PageProps) {
  const navigate = useNavigate()
  const closeLiffOrHome = useCloseLiff()
  const { session } = useSession()
  const { msg, action, hide } = useToast()
  // A new step slides in from the side it comes from (MO1).
  const bodyRef = useStepMotion<HTMLElement>(step ? step[0] : null)

  const onBack = typeof back === 'function' ? back : back ? () => navigate(back) : null

  const bar =
    top !== undefined ? (
      top
    ) : (
      <div className={`vb${step ? ' flat' : ''}`}>
        {onBack ? (
          <button type="button" className="cb" onClick={onBack} aria-label="ย้อนกลับ">
            <Icon n="back" />
          </button>
        ) : (
          <span />
        )}
        {sub ? (
          <div className="vt">
            <b>{title}</b>
            <span>{sub}</span>
          </div>
        ) : (
          <b>{title}</b>
        )}
        {close ? (
          <button type="button" className="cb" onClick={closeLiffOrHome} aria-label="ปิด">
            <Icon n="x" />
          </button>
        ) : (
          <span />
        )}
      </div>
    )

  return (
    <div className="scr liff xl">
      {session.env !== 'production' ? <span className="envchip">{session.env === 'staging' ? 'STAGING' : session.env.toUpperCase()}</span> : null}
      {bar}
      {step ? <StepBar x={step[0]} y={step[1]} /> : null}
      <main ref={bodyRef} className="vbody">
        {children}
      </main>
      {foot ? <div className={`vf${two ? ' two' : ''}`}>{foot}</div> : null}
      {nav ? (
        <nav className={`vnav${session.role === 'worker' ? ' n2' : ''}`} aria-label="เมนูหลัก">
          {(session.role === 'worker' ? WORKER_NAV : NAV).map(([k, ic, label, path]) => (
            <button key={k} type="button" className={k === nav ? 'on' : ''} aria-current={k === nav ? 'page' : undefined} onClick={() => navigate(path)}>
              <Icon n={ic} />
              {label}
            </button>
          ))}
        </nav>
      ) : null}
      {over}
      {flash ? <div className="flash" aria-hidden="true" /> : null}
      {msg ? (
        <div className="toast" role="status" style={nav || foot ? undefined : { bottom: 24 }}>
          <Icon n="check" />
          <span className="tm">{msg}</span>
          {action ? (
            <button
              type="button"
              className="ta"
              onClick={() => {
                hide()
                action.run()
              }}
            >
              {action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** A bottom sheet with the dim behind it; a tap on the dim cancels. */
export function Sheet({ onCancel, children, label, className }: { onCancel: () => void; children: ReactNode; label: string; className?: string }) {
  return (
    <>
      <button type="button" className="dim" aria-label="ปิด" onClick={onCancel} />
      <div className={className ? `sheet ${className}` : 'sheet'} role="dialog" aria-modal="true" aria-label={label}>
        <span className="grab" aria-hidden="true" />
        {children}
      </div>
    </>
  )
}
