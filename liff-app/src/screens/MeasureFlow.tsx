import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { Net, Pt, SaveResponse, Scan } from '@/api/types'
import { Page, useCloseLiff } from '@/components/Page'
import { Btn, ErrorState, InlineError, Pill, Skeleton } from '@/components/ui'
import { NetStep, netChoiceFrom, netChoiceWants, type NetChoice } from '@/components/nets'
import { ResultBody, bandedShrimp } from '@/components/result'
import { NetChangeSheet } from '@/components/net-change'
import { RimEditor } from '@/components/rim'
import { AskAgainSheet } from '@/components/ask-again'
import { Measuring, aspectOf } from '@/components/scan-steps'
import { centredGuess, fitRim } from '@/lib/rim'
import { fmt1, fmtDay, fmtTime } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession } from '@/session'

type Step = 'net' | 'rim' | 'measuring' | 'result'
type Done = { scan: Scan; saved: SaveResponse } | { scan: Scan; askedAt: string }

/**
 * Measure the photos the owner ticked in รูปรอสแกน (O14 to O17). The worker
 * already chose the pond and took the photo, so each photo has the rest of
 * แบบ 2's steps: the ยอ (this pond's already chosen), the rim, then measuring
 * and the result. A summary after the last one.
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

  // The scan being worked on, after measure or a ยอ change; reset per photo.
  const [cur, setCur] = useState<{ id: string; scan: Scan } | null>(null)
  const [rimFor, setRimFor] = useState<{ id: string; pts: Pt[] } | null>(null)
  const [step, setStep] = useState<Step | null>(null)
  // The ยอ step's answer for this photo, and the ยอ it saved.
  const [choice, setChoice] = useState<NetChoice | null>(null)
  const [usedNet, setUsedNet] = useState<Net | null>(null)
  const [measured, setMeasured] = useState(false)
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
  if (!base || !nets.data) {
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
  const netList = nets.data.nets
  const pondNet = scan.net ? (netList.find((n) => n.id === scan.net!.id) ?? scan.net) : null
  const net = usedNet ?? pondNet
  const shape = net?.shape ?? 'round'
  const pick = choice ?? netChoiceFrom(pondNet)
  const steps: Step[] = ['net', 'rim', 'result']
  const at: Step = step ?? steps[0]!
  const stepNo = steps.indexOf(at === 'measuring' ? 'result' : at) + 1
  const aspect = aspectOf(scan)

  const next = (d: Done) => {
    setDone((x) => [...x, d])
    setCur(null)
    setRimFor(null)
    setStep(null)
    setChoice(null)
    setUsedNet(null)
    setMeasured(false)
    setError(null)
    setSheet(null)
    setI((n) => n + 1)
  }

  const go = (s: Step) => {
    setError(null)
    setStep(s)
  }

  /** ถัดไป on the ยอ step: this pond's ยอ from now on, saved new if typed. */
  async function saveNet() {
    const want = netChoiceWants(pick, netList)
    if (!want) return
    setBusy(true)
    setError(null)
    try {
      let n: Net
      if ('net' in want) {
        n = want.net
        if (pondNet?.id !== n.id) await api.setPondNet(scan.pondId, n.id)
      } else {
        n = await api.addNet({ shape: want.shape, cm: want.cm, pondId: scan.pondId, farmDefault: netList.length === 0 })
      }
      // น้ำ guessed the rim for the ยอ it knew; another shape starts from a centred one.
      if (n.shape !== shape) setRim(centredGuess(n.shape))
      setUsedNet(n)
      // Back on this step, the saved ยอ is the choice: ถัดไป again must not save it twice.
      setChoice(netChoiceFrom(n))
      nets.reload()
      go('rim')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  async function measure() {
    setError(null)
    setMeasured(false)
    setStep('measuring')
    try {
      const r = await api.measure(scan.id, { rim, netId: net?.id ?? '' })
      setCur({ id: base!.id, scan: r.scan })
      setCredits(r.creditsLeft)
      setMeasured(true)
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
          <NetStep pondCode={scan.pondCode} nets={netList} pondNet={pondNet} choice={pick} onChoice={setChoice} />
          <InlineError error={error} />
        </>
      )
      foot = (
        <>
          <Btn kind="s" disabled={busy} onClick={() => navigate(P.inbox)}>
            ย้อนกลับ
          </Btn>
          <Btn busy={busy} disabled={!netChoiceWants(pick, netList) || busy} onClick={() => void saveNet()}>
            ถัดไป
          </Btn>
        </>
      )
      break
    case 'rim':
      body = (
        <>
          <RimEditor key={scan.id} photoUrl={scan.photoUrl} aspect={aspect} shape={shape} pts={rim} onChange={setRim} guess={scan.rimGuess} />
          <InlineError error={error} />
        </>
      )
      foot = (
        <>
          <Btn kind="s" onClick={() => go('net')}>
            ย้อนกลับ
          </Btn>
          <Btn disabled={!(rim.length === 4 && fitRim(shape, rim))} onClick={() => void measure()}>
            วัดเลย
          </Btn>
          {askLink}
        </>
      )
      break
    case 'measuring':
      body = (
        <Measuring
          photoUrl={scan.photoUrl}
          aspect={aspect}
          shape={shape}
          rim={rim}
          shrimp={measured && scan.result ? bandedShrimp(scan.result) : null}
          onShown={() => setStep('result')}
        />
      )
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
      back={at === 'measuring' ? undefined : at === 'net' ? P.inbox : () => go(at === 'result' ? 'rim' : 'net')}
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
