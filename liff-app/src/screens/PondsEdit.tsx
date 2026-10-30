import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { PondTile, ZoneSummary } from '@/api/types'
import { Page } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { AddPondsSheet, PondNameSheet, ZoneNameSheet } from '@/components/farm-layout'
import { ErrorState, InlineError, Skeleton } from '@/components/ui'
import { MAX_PER_ZONE, MAX_PONDS, nextZoneLetter, zoneLabel } from '@/lib/farm-layout'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession, useToast } from '@/session'

type Open =
  | { k: 'zone'; z: ZoneSummary }
  | { k: 'pond'; p: PondTile }
  | { k: 'add'; zone: string; isNew: boolean }

/**
 * แก้ไขโซนและบ่อ, the owner's, from the top of รายบ่อ (Bear, 2026-10-31):
 * the farm's zones as onboarding draws them, a card a zone. A tap on the
 * zone's name names it, a tap on a pond renames it, + เพิ่มบ่อ adds ponds to
 * the zone and + เพิ่มโซน a zone with its ponds. Each change saves at once
 * (there is no บันทึก to forget) and says so in the toast. A pond is never
 * deleted here: its scans would go with it.
 */
export default function PondsEdit() {
  const { session, refresh } = useSession()
  const toast = useToast()
  const r = useApi(() => api.ponds())
  const [open, setOpenState] = useState<Open | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (session.role !== 'owner') return <Navigate to={P.ponds} replace />

  // A sheet opens over the toast of the last save, which would sit on its button.
  const setOpen = (o: Open | null) => {
    if (o) toast.hide()
    setOpenState(o)
  }
  const close = () => {
    setOpen(null)
    setError(null)
  }

  if (!r.data) {
    return (
      <Page title="แก้ไขโซนและบ่อ" back={P.ponds}>
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[60, 220, 220]} />}
      </Page>
    )
  }
  const { ponds, zones } = r.data
  const codes = ponds.map((p) => p.code)
  const taken = (c: string) => codes.some((x) => x.toUpperCase() === c.toUpperCase())
  const room = MAX_PONDS - ponds.length
  const newZone = nextZoneLetter(zones.map((z) => z.zone))

  /** One write, then the list again; the toast says what changed (or what the write itself says, when it returns words). */
  const run = async (write: () => Promise<unknown>, said: string, farmChanged = false) => {
    setBusy(true)
    setError(null)
    try {
      const over = await write()
      setOpen(null)
      toast.show(typeof over === 'string' ? over : said)
      r.reload()
      // The pond and zone counts in the session (the overview's header, the done page).
      if (farmChanged) refresh()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const sheet = !open ? null : open.k === 'zone' ? (
    <ZoneNameSheet
      zone={open.z.zone}
      name={open.z.name}
      busy={busy}
      error={error}
      onCancel={close}
      onSave={(name) => void run(() => api.setZoneName(open.z.zone, name), name ? `ตั้งชื่อโซน ${open.z.zone} ว่า ${name} แล้วค่ะ` : `โซน ${open.z.zone} ไม่มีชื่อแล้วค่ะ`)}
    />
  ) : open.k === 'pond' ? (
    <PondNameSheet
      zone={open.p.zone}
      current={open.p.code}
      taken={taken}
      busy={busy}
      error={error}
      onCancel={close}
      onSave={(code) => void run(() => api.renamePond(open.p.id, code), `เปลี่ยน ${open.p.code} เป็น ${code} แล้วค่ะ`)}
    />
  ) : (
    <AddPondsSheet
      zone={open.zone}
      isNew={open.isNew}
      existing={codes}
      max={Math.min(MAX_PER_ZONE, room)}
      busy={busy}
      error={error}
      onCancel={close}
      onSave={(add, name) =>
        void run(
          async () => {
            await api.addPonds(add)
            if (!open.isNew || !name) return
            // The ponds are in: a name that did not save must not send the person back to add them again.
            try {
              await api.setZoneName(open.zone, name)
            } catch {
              return `เพิ่ม ${add.length} บ่อแล้ว แต่ตั้งชื่อโซนไม่สำเร็จ แตะชื่อโซนเพื่อลองอีกครั้งค่ะ`
            }
          },
          open.isNew ? `เพิ่มโซน ${open.zone} ${add.length} บ่อแล้วค่ะ` : `เพิ่ม ${add.length} บ่อในโซน ${open.zone} แล้วค่ะ`,
          true,
        )
      }
    />
  )

  return (
    <Page title="แก้ไขโซนและบ่อ" back={P.ponds} over={sheet}>
      <div className="pe-head">
        <span className="ob-sum">
          <b className="mono">{zones.length}</b> โซน · <b className="mono">{ponds.length}</b> บ่อ
        </span>
        <span className="l5 mut">แตะชื่อโซนหรือชื่อบ่อเพื่อเปลี่ยน · บันทึกทันทีค่ะ</span>
      </div>
      {zones.map((z) => {
        const list = ponds.filter((p) => p.zone === z.zone)
        return (
          <section className="ob-zone" key={z.zone} aria-label={zoneLabel(z.zone, z.name)}>
            <div className="ob-zh">
              <span className="ob-zl" aria-hidden="true">
                {z.zone === '1' ? '#' : z.zone}
              </span>
              <button type="button" className="pe-zn" onClick={() => setOpen({ k: 'zone', z })} aria-label={`ตั้งชื่อ${zoneLabel(z.zone, z.name)}`}>
                <b>{zoneLabel(z.zone, z.name)}</b>
                <Icon n="edit" />
              </button>
              <span className="pe-zc">
                <b className="mono">{list.length}</b> บ่อ
              </span>
            </div>
            <div className="ob-chips">
              {list.map((p) => (
                <button key={p.id} type="button" className="mono" onClick={() => setOpen({ k: 'pond', p })} aria-label={`บ่อ ${p.code} แตะเพื่อเปลี่ยนชื่อ`}>
                  {p.code}
                </button>
              ))}
            </div>
            {room > 0 ? (
              <button type="button" className="pe-more" onClick={() => setOpen({ k: 'add', zone: z.zone, isNew: false })}>
                <Icon n="plus" />
                เพิ่มบ่อในโซนนี้
              </button>
            ) : null}
          </section>
        )
      })}
      {newZone && room > 0 ? (
        <button type="button" className="ob-add" onClick={() => setOpen({ k: 'add', zone: newZone, isNew: true })}>
          <Icon n="plus" />
          เพิ่มโซน {newZone}
        </button>
      ) : null}
      {room <= 0 ? <span className="l5 mut">ฟาร์มนี้มีครบ {MAX_PONDS} บ่อแล้วค่ะ</span> : null}
      {!open ? <InlineError error={error} /> : null}
    </Page>
  )
}
