import { useState } from 'react'
import type { PondTile, PondsResponse } from '@/api/types'
import { Chip } from './ui'

/** A grid of pond tiles: done today in green, not yet in amber, said in words too. */
export function PondGrid<T extends { id: string; code: string; photoToday: boolean }>({
  ponds,
  picked,
  onPick,
  doneWord = 'สแกนแล้ว',
  notWord = 'ยังไม่สแกน',
}: {
  ponds: T[]
  picked: string | null
  onPick: (p: T) => void
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
 * Choose a pond of the farm: a zone, then a pond (60 ponds do not fit one
 * list). A worker never gets this: they pick from their own ponds only.
 */
export function PondPicker({
  data,
  picked,
  onPick,
  doneWord,
  notWord,
}: {
  data: PondsResponse
  picked: string | null
  onPick: (p: PondTile) => void
  doneWord?: string
  notWord?: string
}) {
  const pickedZone = data.ponds.find((p) => p.id === picked)?.zone ?? null
  const [zone, setZone] = useState<string | null>(pickedZone ?? data.zones[0]?.zone ?? null)
  const inZone = data.ponds.filter((p) => p.zone === zone)

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
