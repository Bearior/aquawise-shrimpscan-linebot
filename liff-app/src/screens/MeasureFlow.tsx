import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { NetShape, Pt, SaveResponse, Scan } from '@/api/types'
import { Page, useCloseLiff } from '@/components/Page'
import { Btn, ErrorState, InlineError, Head2, Pill, Skeleton } from '@/components/ui'
import { NetAsk } from '@/components/nets'
import { ResultBody } from '@/components/result'
import { NetChangeSheet } from '@/components/net-change'
import { RimEditor } from '@/components/rim'
import { AskAgainSheet } from '@/components/ask-again'
import { Measuring, aspectOf, measureAtLeast } from '@/components/scan-steps'
import { fitEllipse } from '@/lib/rim'
import { fmt1, fmtDay, fmtTime } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession } from '@/session'

type Step = 'net' | 'rim' | 'measuring' | 'result'
type Done = { scan: Scan; saved: SaveResponse } | { scan: Scan; askedAt: string }

/**
 * Measure the photos the owner ticked in รูปรอสแกน (O14 to O17). The worker
 * already chose the pond and took the photo, so only the ยอ (first time for
 * the farm), the rim and the result are left, then a summary.
 */
export default function MeasureFlow() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const closeOrHome = useCloseLiff()
  const { session } = useSession()
  const farm = session.farm!
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean)

  const [i, setI] = useState(0)
  const [done, setDone] = useState<Done[]>([])
  const scanId = ids[i] ?? null
  const loaded = useApi(() => (scanId ? api.scan(scanId) : Promise.resolve(null)), [scanId])
  const nets = useApi(() => api.nets())
  const [askNet, setAskNet] = useState<boolean | null>(null)
  if (askNet === null && nets.data) setAskNet(nets.data.nets.length === 0)

  // The scan being worked on, after measure or a ยอ change; reset per photo.
  const [cur, setCur] = useState<{ id: string; scan: Scan } | null>(null)
  const [rimFor, setRimFor] = useState<{ id: string; pts: Pt[] } | null>(null)
  const [step, setStep] = useState<Step | null>(null)
  const [found, setFound] = useState<Pt[] | null>(null)
  const [credits, setCredits] = useState(session.creditsLeft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [sheet, setSheet] = useState<'net' | 'ask' | null>(null)

  if (!ids.length) {
    return (
      <Page title="วัดรูป" back={P.inbox}>
        <div className="state">
          <b>ยังไม่ได้เลือกรูปค่ะ</b>
          <Btn kind="s" onClick={() => navigate(P.inbox)}>
            ไปที่รูปรอสแกน
          </Btn>
        </div>
      </Page>
    )
  }

  if (i >= ids.length) return <Summary done={done} credits={credits} target={farm.targetPerKg} onOverview={() => navigate(P.overview)} onChat={closeOrHome} />

  const base = loaded.data
  if (!base || !nets.data || askNet === null) {
    const err = loaded.error ?? nets.error
    return (
      <Page title={`วัดรูป ${i + 1}/${ids.length}`} back={P.inbox}>
        {err ? <ErrorState error={err} onRetry={loaded.reload} /> : <Skeleton rows={[60, 300, 60]} />}
      </Page>
    )
  }

  const scan = cur && cur.id === base.id ? cur.scan : base
  const rim = rimFor && rimFor.id === base.id ? rimFor.pts : (base.result?.rim ?? base.rimGuess)
  const setRim = (pts: Pt[]) => setRimFor({ id: base.id, pts })
  const farmNet = nets.data.nets.find((n) => n.isFarmDefault) ?? null
  const steps: Step[] = [...(askNet && i === 0 ? (['net'] as Step[]) : []), 'rim', 'result']
  const at: Step = step ?? steps[0]!
  const stepNo = steps.indexOf(at === 'measuring' ? 'result' : at) + 1
  const aspect = aspectOf(scan)

  const next = (d: Done) => {
    setDone((x) => [...x, d])
    setCur(null)
    setRimFor(null)
    setStep(null)
    setFound(null)
    setError(null)
    setSheet(null)
    setI((n) => n + 1)
  }

  const go = (s: Step) => {
    setError(null)
    setStep(s)
  }

  async function saveNet(shape: NetShape, cm: number) {
    setError(null)
    try {
      if (farmNet) await api.editNet(farmNet.id, { cm, shape })
      else await api.addNet({ shape, cm, farmDefault: true })
      nets.reload()
    } catch (e) {
      setError(e)
    }
  }

  async function measure() {
    setError(null)
    setFound(null)
    setStep('measuring')
    try {
      const netId = scan.net?.id ?? farmNet?.id ?? nets.data?.nets[0]?.id ?? ''
      const r = await measureAtLeast(scan.id, { rim, netId })
      setCur({ id: base!.id, scan: r.scan })
      setCredits(r.creditsLeft)
      setFound((r.scan.result?.shrimp ?? []).map((q) => ({ x: q.x, y: q.y })))
    } catch (e) {
      setError(e)
      setStep('rim')
    }
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const saved = await api.saveScan(scan.id, {})
      next({ scan, saved })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const askLink = (
    <Btn kind="l" onClick={() => setSheet('ask')}>
      ขอรูปใหม่จาก{scan.photoBy}
    </Btn>
  )

  let body
  let foot
  switch (at) {
    case 'net':
      body = (
        <>
          <NetAsk pondCode={scan.pondCode} saved={farmNet} onSave={(s, cm) => void saveNet(s, cm)} />
          <InlineError error={error} />
        </>
      )
      foot = (
        <>
          <Btn kind="s" onClick={() => navigate(P.inbox)}>
            ย้อนกลับ
          </Btn>
          <Btn disabled={!farmNet} onClick={() => go('rim')}>
            ถัดไป
          </Btn>
        </>
      )
      break
    case 'rim':
      body = (
        <>
          <Head2 t="เส้นเหลืองตรงขอบพื้นยอไหม" d="น้ำวางให้ก่อน อาจยังไม่ตรง · ไม่ตรงตรงไหน ลากจุดนั้น หรือแตะจุดแล้วกดลูกศร" />
          <RimEditor key={scan.id} photoUrl={scan.photoUrl} aspect={aspect} pts={rim} onChange={setRim} guess={scan.rimGuess} />
          <InlineError error={error} />
        </>
      )
      foot = (
        <>
          <Btn kind="s" onClick={() => (steps[0] === 'net' ? go('net') : navigate(P.inbox))}>
            ย้อนกลับ
          </Btn>
          <Btn disabled={!(rim.length === 4 && fitEllipse(rim))} onClick={() => void measure()}>
            วัดเลย
          </Btn>
          {askLink}
        </>
      )
      break
    case 'measuring':
      body = <Measuring photoUrl={scan.photoUrl} aspect={aspect} rim={rim} found={found} onShown={() => setStep('result')} />
      foot = (
        <>
          <Btn kind="s" disabled>
            ย้อนกลับ
          </Btn>
          <Btn disabled>กำลังวัด…</Btn>
        </>
      )
      break
    case 'result':
      body = scan.result ? (
        <ResultBody
          pondCode={scan.pondCode}
          photoUrl={scan.photoUrl}
          aspect={aspect}
          r={scan.result}
          target={farm.targetPerKg}
          onEditNet={() => setSheet('net')}
          onFixRim={() => go('rim')}
          note={`จุดไม่ตรงขอบ กดย้อนกลับไปแก้ แล้ววัดใหม่ได้อีก ${scan.result.remeasuresLeft} ครั้ง ไม่เสียเครดิต`}
        >
          <InlineError error={error} />
        </ResultBody>
      ) : null
      foot = (
        <>
          <Btn kind="s" disabled={busy} onClick={() => go('rim')}>
            ย้อนกลับ
          </Btn>
          <Btn busy={busy} disabled={busy} onClick={() => void save()}>
            บันทึกเข้าบ่อ {scan.pondCode}
          </Btn>
          {askLink}
        </>
      )
      break
  }

  return (
    <Page
      title={`วัดรูป ${i + 1}/${ids.length} · ${scan.pondCode}`}
      sub={`${scan.photoBy}ส่ง ${fmtTime(scan.photoAt)} · เหลือ ${credits} เครดิต`}
      back={at === 'measuring' ? undefined : P.inbox}
      step={[stepNo, steps.length]}
      two
      foot={foot}
      over={
        sheet === 'net' ? (
          <NetChangeSheet
            scan={scan}
            nets={nets.data.nets}
            onMeasured={(r) => {
              setCur({ id: base.id, scan: r.scan })
              setCredits(r.creditsLeft)
            }}
            onNetAdded={() => nets.reload()}
            onClose={() => setSheet(null)}
          />
        ) : sheet === 'ask' ? (
          <AskAgainSheet
            scanId={scan.id}
            pondCode={scan.pondCode}
            sender={scan.photoBy}
            ownerName={farm.ownerName}
            onCancel={() => setSheet(null)}
            onDone={() => next({ scan, askedAt: new Date().toISOString() })}
          />
        ) : null
      }
    >
      {body}
    </Page>
  )
}

/** วัดครบแล้ว (O17). */
function Summary({
  done,
  credits,
  target,
  onOverview,
  onChat,
}: {
  done: Done[]
  credits: number
  target: number
  onOverview: () => void
  onChat: () => void
}) {
  const measured = done.filter((d): d is { scan: Scan; saved: SaveResponse } => 'saved' in d)
  return (
    <Page
      title="วัดครบแล้ว"
      close
      foot={
        <>
          <Btn onClick={onOverview}>ดูภาพรวมฟาร์ม</Btn>
          <Btn kind="l" onClick={onChat}>
            กลับแชท
          </Btn>
        </>
      }
    >
      <b className="l1">วัดแล้ว {measured.length} รูปค่ะ</b>
      <span className="l5 mut">
        ใช้ {measured.length} เครดิต · เหลือ {credits}
      </span>
      <div className="vc lst">
        {done.map((d) => (
          <div className="li" key={d.scan.id}>
            <span className="thm photo" style={{ backgroundImage: `url(${d.scan.photoUrl})` }} />
            {'saved' in d && d.scan.result ? (
              <>
                <span className="tx">
                  <b>
                    {d.scan.pondCode} · {Math.round(d.scan.result.perKg)} ตัว/กก.
                  </b>
                  <span>
                    {fmt1(d.scan.result.abw)} ก.
                    {d.saved.reachOn ? ` · ถึงไซส์ ${target} ราว ${fmtDay(d.saved.reachOn)}` : ''}
                  </span>
                </span>
                <Pill k="ok">บันทึกแล้ว</Pill>
              </>
            ) : (
              <>
                <span className="tx">
                  <b>{d.scan.pondCode} · รอรูปใหม่</b>
                  <span>
                    ขอ{d.scan.photoBy}แล้ว {'askedAt' in d ? fmtTime(d.askedAt) : ''}
                  </span>
                </span>
                <Pill k="wn">รอ</Pill>
              </>
            )}
          </div>
        ))}
      </div>
    </Page>
  )
}
