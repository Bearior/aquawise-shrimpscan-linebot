import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { MeasureResponse, Net, NetShape, Scan } from '@/api/types'
import { P } from '@/routes'
import { Btn, Head2, InlineError, Saved } from './ui'
import { Sheet } from './Page'
import { NetNewSheet, NetRows } from './nets'

/**
 * Change the ยอ under a result (O19h), or type a new size (O19i). Either way
 * น้ำ measures the same photo again against it, free, and the ยอ becomes this
 * pond's from now on.
 */
export function NetChangeSheet({
  scan,
  nets,
  onMeasured,
  onNetAdded,
  onClose,
}: {
  scan: Scan
  nets: Net[]
  onMeasured: (r: MeasureResponse) => void
  onNetAdded: (n: Net) => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'pick' | 'new'>('pick')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState(false)
  const picked = scan.result?.net.id ?? scan.net?.id ?? null

  const remeasure = async (netId: string) => {
    setBusy(true)
    setError(null)
    try {
      const r = await api.changeNet(scan.id, netId)
      onMeasured(r)
      setDone(true)
      return true
    } catch (e) {
      setError(e)
      return false
    } finally {
      setBusy(false)
    }
  }

  const addNew = async (shape: NetShape, cm: number) => {
    setBusy(true)
    setError(null)
    try {
      const n = await api.addNet({ shape, cm, pondId: scan.pondId })
      onNetAdded(n)
      setBusy(false)
      if (await remeasure(n.id)) onClose()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  if (mode === 'new') {
    return (
      <NetNewSheet
        title={`ยอใหม่ของบ่อ ${scan.pondCode}`}
        after={`กดเสร็จ น้ำบันทึกแล้วคิดผลบ่อ ${scan.pondCode} ใหม่ให้`}
        busy={busy}
        onDone={(s, cm) => void addNew(s, cm)}
        onCancel={() => setMode('pick')}
      />
    )
  }

  return (
    <Sheet onCancel={onClose} label={`ยอของบ่อ ${scan.pondCode}`}>
      <Head2 t={`ยอของบ่อ ${scan.pondCode}`} d={`ยอที่ฟาร์มนี้ใช้ น้ำจำไว้ ${nets.length} ขนาด`} />
      <NetRows nets={nets} picked={picked} onPick={(n) => n.id !== picked && !busy && void remeasure(n.id)} onAdd={() => setMode('new')} />
      {busy ? <span className="l5 mut">น้ำกำลังคิดผลใหม่ค่ะ</span> : null}
      <InlineError error={error} />
      {done && !busy ? (
        <>
          <Saved>บันทึกแล้ว · น้ำคิดผลใหม่ให้แล้ว</Saved>
          <span className="l5 mut" style={{ marginTop: -8 }}>
            ไม่ใช้เครดิต เพราะวัดจากรูปเดิม
          </span>
        </>
      ) : null}
      <Btn onClick={onClose} disabled={busy}>
        เสร็จ
      </Btn>
      <Btn kind="l" onClick={() => navigate(P.nets)}>
        ดูยอทุกบ่อ
      </Btn>
    </Sheet>
  )
}
