import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { Stocking as StockingData } from '@/api/types'
import { Page } from '@/components/Page'
import { Btn, Chip, ErrorState, Head2, Head3, InlineError, Skeleton } from '@/components/ui'
import { fmtDayYear, fmtInt } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useToast } from '@/session'

const SURVIVAL: [number | null, string][] = [
  [0.7, '70%'],
  [0.8, '80%'],
  [0.9, '90%'],
  [null, 'ไม่แน่ใจ'],
]

function Form({ pondId, initial }: { pondId: string; initial: StockingData }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [on, setOn] = useState(initial.stockedOn ?? '')
  const [count, setCount] = useState(initial.count ? String(initial.count) : '')
  const [survival, setSurvival] = useState<number | null>(initial.survival)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const n = Number(count.replace(/\D/g, ''))

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.saveStocking(pondId, { stockedOn: on || null, count: n || null, survival })
      toast.show('บันทึกข้อมูลลงกุ้งแล้ว')
      navigate(P.pond(pondId), { replace: true })
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <Page
      title="ข้อมูลลงกุ้ง"
      back={P.pond(pondId)}
      two
      foot={
        <>
          <Btn kind="s" onClick={() => navigate(P.pond(pondId))}>
            ข้าม
          </Btn>
          <Btn busy={busy} disabled={busy || (!on && !n)} onClick={() => void save()}>
            บันทึก
          </Btn>
        </>
      }
    >
      <Head2 t="ใส่ครั้งเดียวพอค่ะ" d="น้ำใช้คิดว่ากุ้งในบ่อกี่ตัน · ประมาณได้ แก้ทีหลังได้" />
      <div className="grp">
        <Head3 t="ลงกุ้งวันที่" />
        <label className="inp">
          <input type="date" value={on} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setOn(e.target.value)} aria-label="ลงกุ้งวันที่" />
        </label>
        {on ? <span className="l5 mut">{fmtDayYear(on)}</span> : null}
      </div>
      <div className="grp">
        <Head3 t="ลงกี่ตัว" />
        <label className="inp mono">
          <input
            inputMode="numeric"
            value={n ? fmtInt(n) : ''}
            onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 9))}
            aria-label="ลงกี่ตัว"
            placeholder="เช่น 200,000"
          />
        </label>
      </div>
      <div className="grp">
        <Head3 t="คิดว่ารอดราวเท่าไหร่" />
        <div className="chips">
          {SURVIVAL.map(([v, l]) => (
            <Chip key={l} on={survival === v} onClick={() => setSurvival(v)}>
              {l}
            </Chip>
          ))}
        </div>
      </div>
      <InlineError error={error} />
    </Page>
  )
}

/** ข้อมูลลงกุ้ง (O24): asked once per pond, estimates are fine, skippable. No cost. */
export default function Stocking() {
  const { id = '' } = useParams()
  const r = useApi(() => api.stocking(id), [id])
  if (!r.data) {
    return (
      <Page title="ข้อมูลลงกุ้ง" back={P.pond(id)}>
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[60, 90, 90, 60]} />}
      </Page>
    )
  }
  return <Form key={id} pondId={id} initial={r.data} />
}
