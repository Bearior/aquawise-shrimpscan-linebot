import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { FixResponse, Pt } from '@/api/types'
import { Page } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { Btn, ErrorState, InlineError, Skeleton } from '@/components/ui'
import { RimEditor } from '@/components/rim'
import { DistBody, bandedShrimp } from '@/components/result'
import { Measuring, aspectOf } from '@/components/scan-steps'
import { bangkokDay, daysBetween, fmt1, fmtDay, fmtWhen } from '@/lib/format'
import { fitRim } from '@/lib/rim'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession, useToast } from '@/session'
import { ERR } from '@/copy/th'

/**
 * แก้ขอบยอ (E3 to E5): the same photo, the old rim dashed white, the new one
 * yellow. น้ำ measures again free, then both results side by side; keep the
 * old one or use the new. The old result always stays in the history.
 */
export default function Fix() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { session } = useSession()
  const toast = useToast()
  const r = useApi(() => api.scan(id), [id])
  const [edit, setEdit] = useState<Pt[] | null>(null)
  const [step, setStep] = useState<'rim' | 'measuring' | 'compare'>('rim')
  const [res, setRes] = useState<FixResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const worker = session.role === 'worker'

  if (!r.data) {
    return (
      <Page title="แก้ขอบยอ" back={worker ? P.today : P.home}>
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[60, 300, 60]} />}
      </Page>
    )
  }
  const scan = r.data
  const back = worker ? P.today : P.history(scan.pondId)
  const old = scan.result
  if (!old || !scan.canFix) {
    return (
      <Page title={`แก้ขอบยอ · บ่อ ${scan.pondCode}`} back={back}>
        <div className="state">
          <b>{old ? 'ผลนี้แก้ไม่ได้ค่ะ' : 'รูปนี้ยังไม่ได้วัดค่ะ'}</b>
          <span>{old ? 'แก้ได้เฉพาะผลที่ตัวเองสแกน หรือเมื่อเจ้าของเปิดสิทธิ์แก้ผลของคนอื่นให้' : 'วัดรูปก่อน แล้วค่อยแก้ขอบยอนะคะ'}</span>
        </div>
      </Page>
    )
  }
  const rim = edit ?? old.rim
  const shape = old.net.shape
  const aspect = aspectOf(scan)
  const sub = `${scan.measuredBy ?? scan.photoBy}สแกน ${fmtWhen(old.measuredAt, session.today)} · วัดใหม่ไม่ใช้เครดิต`

  async function remeasure() {
    setError(null)
    setRes(null)
    setStep('measuring')
    try {
      setRes(await api.fix(scan.id, rim))
    } catch (e) {
      setError(e)
      setStep('rim')
    }
  }

  async function apply(use: 'new' | 'old') {
    setBusy(true)
    setError(null)
    try {
      await api.fixApply(scan.id, { use, rim })
      if (use === 'new') {
        const self = scan.measuredBy === session.user.name || scan.photoBy === session.user.name
        toast.show(self ? 'บันทึกผลใหม่แล้ว' : `บันทึกผลใหม่แล้ว · บอก${scan.photoBy}ให้แล้ว`)
      }
      navigate(back, { replace: true })
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  if (step === 'measuring') {
    return (
      <Page
        title={`แก้ขอบยอ · บ่อ ${scan.pondCode}`}
        sub="วัดรูปเดิมใหม่ ไม่ใช้เครดิต"
        two
        foot={
          <>
            <Btn kind="s" disabled>
              ยกเลิก
            </Btn>
            <Btn disabled>กำลังวัด…</Btn>
          </>
        }
      >
        <Measuring
          photoUrl={scan.photoUrl}
          aspect={aspect}
          shape={shape}
          rim={rim}
          shrimp={res ? bandedShrimp(res.after) : null}
          onShown={() => setStep('compare')}
        />
      </Page>
    )
  }

  if (step === 'compare' && res) {
    const a = res.after
    const prev = a.previous
    let say = ''
    if (prev) {
      const diff = a.abw - prev.abw
      const days = Math.max(1, daysBetween(prev.date, bangkokDay(a.measuredAt)))
      say =
        diff > 0
          ? `หนักกว่ารอบ ${fmtDay(prev.date)} ${fmt1(diff)} กรัม · โตวันละราว ${(diff / days).toFixed(2)} กรัม`
          : `ยังเบากว่ารอบ ${fmtDay(prev.date)} ${fmt1(-diff)} กรัม · ลองดูขอบยออีกครั้งนะคะ`
    }
    return (
      <Page
        title={`ผลใหม่ บ่อ ${scan.pondCode}`}
        sub={`วัดรูปเดิม ${fmtWhen(old.measuredAt, session.today)} ด้วยขอบยอใหม่`}
        back={() => setStep('rim')}
        two
        foot={
          <>
            <Btn kind="s" disabled={busy} onClick={() => void apply('old')}>
              เก็บผลเดิม
            </Btn>
            <Btn busy={busy} disabled={busy} onClick={() => void apply('new')}>
              ใช้ผลใหม่
            </Btn>
          </>
        }
      >
        <div className="cmp">
          <div className="old">
            <small>ครั้งก่อน</small>
            <b>{Math.round(res.before.perKg)}</b>
            <span>ตัว/กก. · {fmt1(res.before.abw)} ก.</span>
          </div>
          <Icon n="chev" />
          <div className="new">
            <small>ใหม่</small>
            <b>{Math.round(a.perKg)}</b>
            <span>ตัว/กก. · {fmt1(a.abw)} ก.</span>
          </div>
        </div>
        {say ? <div className="dsay s">{say}</div> : null}
        <DistBody grams={a.shrimp.map((s) => s.g)} target={session.farm!.targetPerKg} />
        <InlineError error={error} />
      </Page>
    )
  }

  return (
    <Page
      title={`แก้ขอบยอ · บ่อ ${scan.pondCode}`}
      sub={sub}
      back={back}
      two
      foot={
        <>
          <Btn kind="s" onClick={() => navigate(back)}>
            ยกเลิก
          </Btn>
          <Btn disabled={!(rim.length === 4 && fitRim(shape, rim)) || old.remeasuresLeft <= 0} onClick={() => void remeasure()}>
            วัดใหม่
          </Btn>
        </>
      }
    >
      <RimEditor photoUrl={scan.photoUrl} aspect={aspect} shape={shape} pts={rim} onChange={setEdit} guess={scan.rimGuess} ghost={old.rim} placedBy="old" />
      {old.remeasuresLeft <= 0 ? (
        <span className="fielderr" role="alert">
          {ERR.remeasureLimit}
        </span>
      ) : null}
      <InlineError error={error} />
    </Page>
  )
}
