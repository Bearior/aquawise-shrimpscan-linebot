import { useState } from 'react'
import type { PondTile, PondsResponse } from '@/api/types'
import { Chip, Head3 } from './ui'

/** A grid of pond tiles: done today in green, not yet in amber, said in words too. */
export function PondGrid({
  ponds,
  picked,
  onPick,
  doneWord = 'สแกนแล้ว',
  notWord = 'ยังไม่สแกน',
}: {
  ponds: PondTile[]
  picked: string | null
  onPick: (p: PondTile) => void
  doneWord?: string
  notWord?: string
}) {
  return (
    <div className="pg" role="radiogroup" aria-label="บ่อ">
      {ponds.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={p.id === picked}
          className={`pd ${p.photoToday ? 'g' : 'm'}${p.id === picked ? ' sel' : ''}`}
          onClick={() => onPick(p)}
        >
          <b>{p.code}</b>
          {p.photoToday ? doneWord : notWord}
        </button>
      ))}
    </div>
  )
}

/**
 * Choose a pond. A worker sees their own ponds first and other zones on
 * request; an owner picks a zone, then a pond (60 ponds do not fit one list).
 */
export function PondPicker({
  data,
  worker,
  picked,
  onPick,
  doneWord,
  notWord,
}: {
  data: PondsResponse
  worker: boolean
  picked: string | null
  onPick: (p: PondTile) => void
  doneWord?: string
  notWord?: string
}) {
  const pickedZone = data.ponds.find((p) => p.id === picked)?.zone ?? null
  const mine = data.ponds.filter((p) => p.mine)
  const firstZone = worker ? null : (pickedZone ?? data.zones[0]?.zone ?? null)
  const [zone, setZone] = useState<string | null>(worker && pickedZone && !mine.some((p) => p.id === picked) ? pickedZone : firstZone)
  const inZone = data.ponds.filter((p) => p.zone === zone)

  if (worker) {
    const otherZones = data.zones.filter((z) => !mine.some((p) => p.zone === z.zone))
    return (
      <>
        {mine.length ? <PondGrid ponds={mine} picked={picked} onPick={onPick} doneWord={doneWord} notWord={notWord} /> : null}
        {otherZones.length ? (
          <div className="grp">
            <Head3 t="บ่ออื่นในฟาร์ม" />
            <div className="chips">
              {otherZones.map((z) => (
                <Chip key={z.zone} on={zone === z.zone} onClick={() => setZone(zone === z.zone ? null : z.zone)}>
                  โซน {z.zone}
                </Chip>
              ))}
            </div>
            {zone ? <PondGrid ponds={inZone} picked={picked} onPick={onPick} doneWord={doneWord} notWord={notWord} /> : null}
          </div>
        ) : null}
      </>
    )
  }

  return (
    <>
      <div className="chips">
        {data.zones.map((z) => (
          <Chip key={z.zone} on={zone === z.zone} onClick={() => setZone(z.zone)}>
            โซน {z.zone}
          </Chip>
        ))}
      </div>
      <PondGrid ponds={inZone} picked={picked} onPick={onPick} doneWord={doneWord} notWord={notWord} />
    </>
  )
}
