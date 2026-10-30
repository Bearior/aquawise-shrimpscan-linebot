import { useState } from 'react'
import type { PondTile, PondsResponse } from '@/api/types'
import { Icon } from './Icon'
import { Sheet } from './Page'
import { ErrorState, Skeleton } from './ui'
import { KIND } from '@/lib/pond-words'

/** The short word on a picker tile: where this pond stands, in one or two words. */
function pickWord(p: PondTile, current: boolean): string {
  if (current) return 'ตอนนี้'
  if (p.status === 'missing') return 'ยังไม่สแกน'
  if (p.status === 'urgent') return 'ต้องดู'
  if (p.status === 'watch') return 'เฝ้าระวัง'
  if (p.daysToTarget === null) return 'ยังไม่รู้'
  return p.daysToTarget <= 0 ? 'วันนี้' : `${p.daysToTarget} วัน`
}

/**
 * เลือกบ่อ, แบบ A of the หน้าบ่อ redesign (docs/shrimpscan-ponds-team-redesign):
 * zone tabs across the top (the letter in a circle, who looks after it under
 * it), the zone's ponds four to a row with their number and state, and the
 * previous and next pond at the bottom. Opens on the zone of the pond you are
 * on, which is outlined. A tile picks and closes; the dim or ✕ cancels.
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
  const ponds = data?.ponds ?? []
  const here = ponds.find((p) => p.id === currentId)
  const [zone, setZone] = useState<string | null>(here?.zone ?? null)
  const z = zone ?? here?.zone ?? data?.zones[0]?.zone ?? null
  const zz = data?.zones.find((x) => x.zone === z) ?? null
  const list = ponds.filter((p) => p.zone === z)
  const i = ponds.findIndex((p) => p.id === currentId)
  const prev = i > 0 ? ponds[i - 1]! : null
  const next = i >= 0 && i < ponds.length - 1 ? ponds[i + 1]! : null

  return (
    <Sheet onCancel={onCancel} label="เลือกบ่อ" className="kp">
      <div className="kp-h">
        <h3>เลือกบ่อ</h3>
        <button type="button" className="ps-x" onClick={onCancel} aria-label="ปิด">
          <Icon n="x" />
        </button>
      </div>
      {data ? (
        <>
          <div className="kp-tabs" role="group" aria-label="โซน" style={{ gridTemplateColumns: `repeat(${Math.max(4, Math.min(6, data.zones.length))}, 1fr)` }}>
            {data.zones.map((x) => (
              <button key={x.zone} type="button" aria-pressed={x.zone === z} onClick={() => setZone(x.zone)}>
                <b>{x.zone}</b>
                <span>{x.caretaker ?? `${x.total} บ่อ`}</span>
              </button>
            ))}
          </div>
          {zz ? (
            <div className="kp-z">
              โซน {zz.zone}
              {zz.caretaker ? ` · ${zz.caretaker}` : ''} <span>· {list.length} บ่อ</span>
            </div>
          ) : null}
          <div className="kp-grid">
            {list.map((p) => {
              const on = p.id === currentId
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`kp-t ${KIND[p.status]}${on ? ' cur' : ''}`}
                  aria-current={on ? 'true' : undefined}
                  aria-label={`บ่อ ${p.code}${p.perKg !== null ? ` ${p.perKg} ตัวต่อกิโล` : ''}`}
                  onClick={() => (on ? onCancel() : onPick(p.id))}
                >
                  <span className="c">{p.code}</span>
                  <span className="n mono">{p.perKg ?? '-'}</span>
                  <span className="w">{pickWord(p, on)}</span>
                </button>
              )
            })}
          </div>
          <div className="kp-nx">
            <button type="button" disabled={!prev} onClick={() => prev && onPick(prev.id)} aria-label={prev ? `บ่อก่อนหน้า ${prev.code}` : 'ไม่มีบ่อก่อนหน้า'}>
              <Icon n="back" />
              {prev?.code ?? ''}
            </button>
            <button type="button" disabled={!next} onClick={() => next && onPick(next.id)} aria-label={next ? `บ่อถัดไป ${next.code}` : 'ไม่มีบ่อถัดไป'}>
              {next?.code ?? ''}
              <Icon n="chev" />
            </button>
          </div>
        </>
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : (
        <Skeleton rows={[60, 30, 200, 52]} />
      )}
    </Sheet>
  )
}
