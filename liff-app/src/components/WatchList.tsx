/**
 * เรื่องน่าจับตา (O21), built the way line-bot's home v8 WatchList is: one card
 * of rows, icon · title · when-chip · chevron. A row opens IN PLACE (nothing
 * remounts on a tap, so every move has a "before"). Five rows show, then
 * ดูอีก N รายการ opens the rest.
 *
 * รับทราบ (farm-wide): the button turns green at once, the row folds away, the
 * count drops and a toast offers เลิกทำ for 4 s. Acknowledged items collect in
 * a quiet footer that says who and when, with เอากลับ. An item that leaves by
 * being done (a pond not scanned yet) has no รับทราบ.
 *
 * Motion is Day's MO1: select 160 for the button, height 300 for every open,
 * close and fold, fade 180 for the content. Reduced motion cuts all of it.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { WatchAck, WatchItem } from '@/api/types'
import iconHarvest from '@/assets/watch/fam_scale.svg'
import iconSlow from '@/assets/watch/fam_larvae.svg'
import iconMissing from '@/assets/watch/fam_pad.svg'
import { MOTION, prefersReducedMotion } from '@/lib/motion'
import { P } from '@/routes'
import { useToast } from '@/session'
import { Icon } from './Icon'

/** Rows shown before ดูอีก N รายการ. */
const FIRST = 5

const ICONS: Record<WatchItem['kind'], string> = { harvest: iconHarvest, slow: iconSlow, missing: iconMissing }

/** The green label shows this long before the row starts to fold. */
const SETTLE_MS = 320

/** `**x**` in the server's words becomes bold. */
function rich(s: string): ReactNode {
  return s.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))
}

/**
 * Opens and closes in place: the rows track goes 0fr to 1fr, the content
 * fades. Visibility flips at the END of a close, so the fold is seen and the
 * closed content leaves the tab order.
 */
function Fold({ open, children, testId }: { open: boolean; children: ReactNode; testId?: string }) {
  return (
    <div className="wl-fold" data-open={open ? 'true' : 'false'} data-testid={testId} aria-hidden={open ? undefined : true}>
      <div>
        <div>{children}</div>
      </div>
    </div>
  )
}

/** A local answer about one item: acked (who/when empty while saving) or taken back. */
type Local = WatchAck | 'open'

interface RowProps {
  item: WatchItem
  first: boolean
  open: boolean
  /** Mounts closed and grows in (เลิกทำ, เอากลับ). */
  grow: boolean
  onToggle: () => void
  onAct: () => void
  /** The fold has finished: the parent moves the item to the footer. */
  onAcked: () => void
}

function WatchRow({ item, first, open, grow, onToggle, onAct, onAcked }: RowProps) {
  const [confirming, setConfirming] = useState(false)
  const [folding, setFolding] = useState(false)
  const [entered, setEntered] = useState(!grow)
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (entered) return
    // One frame closed, then open, so the height has a "before" to grow from.
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [entered])
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), [])

  const ack = () => {
    if (confirming) return
    setConfirming(true)
    const reduced = prefersReducedMotion()
    timers.current.push(
      window.setTimeout(
        () => {
          setFolding(true)
          timers.current.push(window.setTimeout(onAcked, reduced ? 0 : MOTION.dur.height))
        },
        reduced ? 120 : SETTLE_MS,
      ),
    )
  }

  return (
    <Fold open={entered && !folding}>
      <div className={`wl-it${first ? ' first' : ''}${open ? ' open' : ''}`} data-testid="watch-item" data-key={item.key}>
        <button type="button" className="wl-row" aria-expanded={open} onClick={onToggle} data-testid="watch-row">
          <img src={ICONS[item.kind]} alt="" aria-hidden="true" width={40} height={40} />
          <span className="wl-t">{item.title}</span>
          <span className={`wl-chip ${item.tone}`}>{item.chip}</span>
          <Icon n="chev" />
        </button>
        <Fold open={open}>
          <div className="wl-more">
            <p className="wl-d">{rich(item.detail)}</p>
            {item.auto ? <p className="wl-auto">{item.auto}</p> : null}
            <div className="wl-acts">
              {item.action ? (
                <button type="button" className="wl-btn blue" onClick={onAct}>
                  {item.action.label}
                  <Icon n="chev" />
                </button>
              ) : null}
              {item.ackable ? (
                <button
                  type="button"
                  className={`wl-btn ${confirming ? 'acked' : 'ack'}`}
                  onClick={ack}
                  disabled={confirming}
                  data-testid="watch-ack"
                >
                  <Icon n="check" />
                  {confirming ? 'รับทราบแล้ว' : 'รับทราบ'}
                </button>
              ) : null}
            </div>
          </div>
        </Fold>
      </div>
    </Fold>
  )
}

export function WatchList({ items }: { items: WatchItem[] }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [local, setLocal] = useState<ReadonlyMap<string, Local>>(new Map())
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [ackOpen, setAckOpen] = useState(false)
  const [growKey, setGrowKey] = useState<string | null>(null)
  // One number per item: an answer from the server lands only if nothing newer
  // happened to that item since. A DELETE waits for the PUT in flight.
  const seq = useRef(new Map<string, number>())
  const inflight = useRef(new Map<string, Promise<unknown>>())

  if (items.length === 0) return null

  const ackOf = (i: WatchItem): WatchAck | null => {
    if (!i.ackable) return null
    const l = local.get(i.key)
    if (l === 'open') return null
    return l ?? i.acked
  }
  const active = items.filter((i) => !ackOf(i))
  const acked = items.filter((i) => ackOf(i))
  const hidden = active.length - FIRST

  const set = (key: string, v: Local) =>
    setLocal((prev) => {
      const next = new Map(prev)
      next.set(key, v)
      return next
    })
  const bump = (key: string) => {
    const n = (seq.current.get(key) ?? 0) + 1
    seq.current.set(key, n)
    return n
  }
  const latest = (key: string, n: number) => seq.current.get(key) === n

  const go = (i: WatchItem) => {
    const a = i.action
    if (!a) return
    navigate(a.to === 'pond' && a.pondId ? P.pond(a.pondId) : a.to === 'team' ? P.team : `${P.ponds}?f=urgent`)
  }

  const takeBack = (i: WatchItem, before: WatchAck, say: string | null) => {
    const mine = bump(i.key)
    set(i.key, 'open')
    setGrowKey(i.key)
    if (say) toast.show(say)
    const wait = inflight.current.get(i.key) ?? Promise.resolve()
    wait
      .then(() => api.unackWatch(i.key))
      .catch(() => {
        if (!latest(i.key, mine)) return
        set(i.key, before)
        toast.show('บันทึกไม่ได้ ลองใหม่อีกครั้งค่ะ')
      })
  }

  const commitAck = (i: WatchItem) => {
    const mine = bump(i.key)
    // No invented who/when: the footer line waits for the stored row.
    const pending: WatchAck = { by: '', at: '' }
    set(i.key, pending)
    if (openKey === i.key) setOpenKey(null)
    toast.show('รับทราบแล้ว', { label: 'เลิกทำ', run: () => takeBack(i, pending, null) })
    const put = api.ackWatch(i.key, i.signature)
    inflight.current.set(i.key, put.catch(() => undefined))
    put
      .then((a) => {
        if (latest(i.key, mine)) set(i.key, a)
      })
      .catch(() => {
        if (!latest(i.key, mine)) return
        set(i.key, 'open')
        setGrowKey(i.key)
        toast.show('บันทึกไม่ได้ ลองใหม่อีกครั้งค่ะ')
      })
  }

  return (
    <section className="wl" data-testid="watch">
      <div className="wl-h">
        <h2>เรื่องน่าจับตา</h2>
        <span>{active.length ? `${active.length} รายการ` : 'ไม่มีเรื่องค้าง'}</span>
      </div>
      <div className="wl-card">
        {active.length === 0 ? (
          <div className="wl-empty" data-testid="watch-empty">
            <Icon n="check" />
            รับทราบครบทุกเรื่องแล้วค่ะ
          </div>
        ) : null}
        {active.map((i, n) => (
          <Fold key={i.key} open={n < FIRST || showAll}>
            <WatchRow
              item={i}
              first={n === 0}
              open={openKey === i.key}
              grow={growKey === i.key}
              onToggle={() => setOpenKey((k) => (k === i.key ? null : i.key))}
              onAct={() => go(i)}
              onAcked={() => commitAck(i)}
            />
          </Fold>
        ))}
        {hidden > 0 && !showAll ? (
          <button type="button" className="wl-all" onClick={() => setShowAll(true)} data-testid="watch-more">
            ดูอีก {hidden} รายการ
            <Icon n="chev" />
          </button>
        ) : null}
        {acked.length ? (
          <>
            <button
              type="button"
              className={`wl-ackh${ackOpen ? ' open' : ''}`}
              aria-expanded={ackOpen}
              onClick={() => setAckOpen((o) => !o)}
              data-testid="watch-acked-toggle"
            >
              <span className="wl-ok">
                <Icon n="check" />
              </span>
              รับทราบแล้ว {acked.length} รายการ
              <Icon n="chev" />
            </button>
            <Fold open={ackOpen} testId="watch-acked-list">
              <div className="wl-acked">
                <p>เรื่องที่มีคนในฟาร์มรับทราบแล้ว กดเอากลับได้ถ้ายังไม่เสร็จ</p>
                {acked.map((i) => {
                  const a = ackOf(i)!
                  return (
                    <div key={i.key} className="wl-ar" data-testid="watch-acked-row">
                      <img src={ICONS[i.kind]} alt="" aria-hidden="true" width={36} height={36} />
                      <span>
                        {i.title}
                        {a.by && a.at ? (
                          <small>
                            {a.by} รับทราบ {a.at} น.
                          </small>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="wl-btn plain"
                        data-testid="watch-unack"
                        onClick={() => {
                          if (acked.length === 1) setAckOpen(false)
                          takeBack(i, a, 'เอากลับมาแล้วค่ะ')
                        }}
                      >
                        เอากลับ
                      </button>
                    </div>
                  )
                })}
              </div>
            </Fold>
          </>
        ) : null}
      </div>
    </section>
  )
}
