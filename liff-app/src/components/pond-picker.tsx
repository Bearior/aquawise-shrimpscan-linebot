import { useLayoutEffect, useRef } from 'react'
import type { PondStatus, PondTile, PondsResponse } from '@/api/types'
import { Icon } from './Icon'
import { Sheet } from './Page'
import { ErrorState, Skeleton } from './ui'

const DOT: Record<PondStatus, string> = { ready: 'r', good: 'g', watch: 'w', urgent: 'u', missing: 'm' }

/** The words รายบ่อ puts under each pond, beside its size. */
function stateLine(p: PondTile): string {
  const st =
    p.status === 'urgent'
      ? 'ต้องดู'
      : p.status === 'missing'
        ? 'ยังไม่สแกน'
        : p.status === 'watch'
          ? 'เฝ้าระวัง'
          : p.daysToTarget === null
            ? 'ยังไม่รู้'
            : p.daysToTarget <= 0
              ? 'ถึงไซส์แล้ว'
              : `อีก ${p.daysToTarget} วัน`
  return p.perKg !== null ? `ไซส์ ${p.perKg} · ${st}` : st
}

/**
 * เลือกบ่อ: the sheet the pond name in หน้าบ่อ's header opens. Same anatomy as
 * น้องน้ำ's PondPickerSheet (line-bot): grab, title and ✕, a heading per group
 * with a hairline, one row per pond with its status dot, the pond you are on
 * tinted and scrolled into view. A row picks and closes; the dim or ✕ cancels.
 */
export function PondPickerSheet({
  data,
  error,
  onRetry,
  currentId,
  onPick,
  onCancel,
}: {
  data: PondsResponse | null
  error: unknown
  onRetry: () => void
  currentId: string
  onPick: (id: string) => void
  onCancel: () => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const onRef = useRef<HTMLButtonElement>(null)

  // Bring the pond you are on into the middle of the list before it paints. Only the list scrolls: the title and ✕ stay.
  useLayoutEffect(() => {
    const list = listRef.current
    const row = onRef.current
    if (list && row) list.scrollTop = Math.max(0, row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2)
  }, [data])

  return (
    <Sheet onCancel={onCancel} label="เลือกบ่อ" className="pk">
      <div className="pk-h">
        <b className="l2">เลือกบ่อ</b>
        <button type="button" className="cb" onClick={onCancel} aria-label="ปิด">
          <Icon n="x" />
        </button>
      </div>
      <div ref={listRef} className="pk-list">
        {data ? (
          data.zones.map((z) => {
            const ponds = data.ponds.filter((p) => p.zone === z.zone)
            if (!ponds.length) return null
            return (
              <div key={z.zone} className="pk-g" role="group" aria-label={`โซน ${z.zone}`}>
                <div className="pk-zh">
                  <span>
                    โซน {z.zone} · {ponds.length} บ่อ
                  </span>
                  <i aria-hidden="true" />
                </div>
                {ponds.map((p) => {
                  const on = p.id === currentId
                  return (
                    <button
                      key={p.id}
                      ref={on ? onRef : undefined}
                      type="button"
                      className={`pkr${on ? ' on' : ''}`}
                      aria-current={on ? 'true' : undefined}
                      onClick={() => (on ? onCancel() : onPick(p.id))}
                    >
                      <i className={`pk-dot ${DOT[p.status]}`} aria-hidden="true" />
                      <b>{p.code}</b>
                      <span>{stateLine(p)}</span>
                    </button>
                  )
                })}
              </div>
            )
          })
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : (
          <Skeleton rows={[44, 52, 52, 52, 52]} />
        )}
      </div>
    </Sheet>
  )
}
