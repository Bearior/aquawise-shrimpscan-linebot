import { useState } from 'react'
import { api } from '@/api/client'
import type { Net, NetShape, PondTile } from '@/api/types'
import { Page, Sheet } from '@/components/Page'
import { Btn, ErrorState, Head2, InlineError, Skeleton } from '@/components/ui'
import { NetNewSheet, NetRows } from '@/components/nets'
import { PondPicker } from '@/components/pond-pick'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useToast } from '@/session'

type Over = { kind: 'new' } | { kind: 'edit'; net: Net } | { kind: 'pond'; pond: PondTile | null } | null

/**
 * ยอของฟาร์ม (O38, O38a): every size น้ำ remembers, how many ponds use it, who
 * typed it. A change applies to the next scan; saved results stay as they are.
 */
export default function Nets() {
  const toast = useToast()
  const nets = useApi(() => api.nets())
  const ponds = useApi(() => api.ponds())
  const [over, setOver] = useState<Over>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (!nets.data) {
    return (
      <Page title="ยอของฟาร์ม" back={P.settings}>
        {nets.error ? <ErrorState error={nets.error} onRetry={nets.reload} /> : <Skeleton rows={[60, 200, 60]} />}
      </Page>
    )
  }
  const list = nets.data.nets

  const run = async (fn: () => Promise<unknown>, said: string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      nets.reload()
      ponds.reload()
      setOver(null)
      toast.show(said)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  let sheet = null
  if (over?.kind === 'new') {
    sheet = (
      <NetNewSheet
        title="ใส่ขนาดยอใหม่"
        after="กดเสร็จ น้ำจำขนาดนี้ไว้ ผูกบ่อได้ที่ตั้งยอรายบ่อ"
        busy={busy}
        onCancel={() => setOver(null)}
        onDone={(shape: NetShape, cm: number) => void run(() => api.addNet({ shape, cm, farmDefault: list.length === 0 }), `จำยอ ${cm} ซม. ไว้แล้ว`)}
      />
    )
  } else if (over?.kind === 'edit') {
    sheet = (
      <NetNewSheet
        title={`แก้ขนาดยอ · ${over.net.use}`}
        after="แก้แล้วใช้กับการสแกนครั้งต่อไป ผลที่บันทึกไปแล้วไม่เปลี่ยนเอง"
        initial={{ shape: over.net.shape, cm: over.net.cm }}
        busy={busy}
        onCancel={() => setOver(null)}
        onDone={(shape, cm) => void run(() => api.editNet(over.net.id, { cm, shape }), `แก้เป็น ${cm} ซม. แล้ว`)}
      />
    )
  } else if (over?.kind === 'pond') {
    const pond = over.pond
    sheet = (
      <Sheet onCancel={() => setOver(null)} label="ตั้งยอรายบ่อ">
        {pond ? (
          <>
            <Head2 t={`ยอของบ่อ ${pond.code}`} d="เลือกขนาดที่บ่อนี้ใช้ ใช้กับการสแกนครั้งต่อไป" />
            <NetRows
              nets={list}
              picked={pond.netId}
              onPick={(n) => void run(() => api.setPondNet(pond.id, n.id), `บ่อ ${pond.code} ใช้ยอ ${n.cm} ซม. แล้ว`)}
              onAdd={() => setOver({ kind: 'new' })}
            />
            <Btn kind="l" onClick={() => setOver({ kind: 'pond', pond: null })}>
              เลือกบ่ออื่น
            </Btn>
          </>
        ) : ponds.data ? (
          <>
            <Head2 t="ตั้งยอบ่อไหนคะ" d="บ่อที่ไม่ได้ตั้ง ใช้ยอของฟาร์ม" />
            <PondPicker data={ponds.data} worker={false} picked={null} onPick={(p) => setOver({ kind: 'pond', pond: p })} doneWord="" notWord="" />
          </>
        ) : (
          <Skeleton rows={[48, 200]} />
        )}
        <InlineError error={error} />
      </Sheet>
    )
  }

  return (
    <Page title="ยอของฟาร์ม" back={P.settings} over={sheet}>
      <Head2 t={`ยอที่น้ำจำไว้ ${list.length} ขนาด`} d="ใส่ครั้งเดียว ครั้งหน้าน้ำใช้ให้เอง ไม่ถามอีก" />
      <NetRows nets={list} onEdit={(net) => setOver({ kind: 'edit', net })} onAdd={() => setOver({ kind: 'new' })} />
      <span className="l5 mut">แก้แล้วใช้กับการสแกนครั้งต่อไป ผลที่บันทึกไปแล้วไม่เปลี่ยนเอง</span>
      {list.length ? (
        <Btn kind="s" icon="plus" onClick={() => setOver({ kind: 'pond', pond: null })}>
          ตั้งยอรายบ่อ
        </Btn>
      ) : null}
      {over ? null : <InlineError error={error} />}
    </Page>
  )
}
