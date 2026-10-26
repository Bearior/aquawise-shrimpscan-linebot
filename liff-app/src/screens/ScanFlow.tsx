import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { Net, NetShape, Pt, Scan } from '@/api/types'
import { Page, useCloseLiff } from '@/components/Page'
import { Btn, Chip, ErrorState, Head2, Head3, InlineError, Skeleton, WarnRow } from '@/components/ui'
import { PondPicker } from '@/components/pond-pick'
import { NetAsk } from '@/components/nets'
import { NetChip, ResultBody } from '@/components/result'
import { NetChangeSheet } from '@/components/net-change'
import { RimEditor } from '@/components/rim'
import { Measuring, PhotoGuide, aspectOf, measureAtLeast, prepPhoto, usePhotoPicker } from '@/components/scan-steps'
import { closeLiff, sendChatText } from '@/lib/liff-actions'
import { fitEllipse } from '@/lib/rim'
import { fmtWeekday } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession, useToast } from '@/session'

type Step = 'pond' | 'net' | 'photo' | 'rim' | 'measuring' | 'result'

const NOTE_CHIPS = ['กินดี', 'กินลดลง', 'ตัวนิ่ม', 'ขี้ขาว', 'น้ำเขียวจัด']

/**
 * สแกนกุ้ง from the menu (W17 to W22 for a worker, O19 to O19i for the owner):
 * pond, the ยอ (first time for the farm only), photo, rim, then the result.
 */
export default function ScanFlow() {
  const { session } = useSession()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const closeOrHome = useCloseLiff()
  const toast = useToast()
  const worker = session.role === 'worker'
  const farm = session.farm!

  const ponds = useApi(() => api.ponds())
  const nets = useApi(() => api.nets())

  const startPond = params.get('pond')
  const [pondId, setPondId] = useState<string | null>(startPond)
  const [step, setStep] = useState<Step>(startPond ? 'photo' : 'pond')
  // Ask about the ยอ only when the farm has none when the flow opens.
  const [askNet, setAskNet] = useState<boolean | null>(null)
  if (askNet === null && nets.data) setAskNet(nets.data.nets.length === 0)

  const [credits, setCredits] = useState(session.creditsLeft)
  const [scan, setScan] = useState<Scan | null>(null)
  const [photo, setPhoto] = useState<{ url: string; aspect: number } | null>(null)
  const [rim, setRim] = useState<Pt[]>([])
  const [found, setFound] = useState<Pt[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [sheet, setSheet] = useState(false)
  const [notes, setNotes] = useState<string[]>([])
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')

  // The photo shows from memory (no second download); drop it on the way out.
  const urlRef = useRef<string | null>(null)
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  async function onFile(f: File) {
    if (!pondId) return
    setBusy(true)
    setError(null)
    try {
      const local = await prepPhoto(f)
      const res = await api.uploadScan(pondId, local.blob)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(local.blob)
      urlRef.current = url
      setPhoto({ url, aspect: aspectOf(res.scan, local) })
      setScan(res.scan)
      setRim(res.scan.rimGuess)
      setStep('rim')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const picker = usePhotoPicker((f) => void onFile(f))

  if (!session.permissions.scanSelf) {
    return (
      <Page title="สแกนกุ้ง" close>
        <div className="state">
          <span className="nn av-nn" aria-hidden="true" />
          <b>บัญชีนี้ยังสแกนเองไม่ได้ค่ะ</b>
          <span>ส่งรูปยอให้เจ้าของวัดในแชทได้เลย หรือขอให้เจ้าของเปิดสิทธิ์สแกนเองให้นะคะ</span>
          <Btn kind="s" onClick={closeOrHome}>
            กลับไปที่แชท
          </Btn>
        </div>
      </Page>
    )
  }

  if (!ponds.data || !nets.data || askNet === null) {
    const err = ponds.error ?? nets.error
    return (
      <Page title="สแกนกุ้ง" close>
        {err ? (
          <ErrorState
            error={err}
            onRetry={() => {
              ponds.reload()
              nets.reload()
            }}
          />
        ) : (
          <Skeleton rows={[60, 220, 120]} />
        )}
      </Page>
    )
  }

  const pond = ponds.data.ponds.find((p) => p.id === pondId) ?? null
  const netList = nets.data.nets
  const pondNet: Net | null = netList.find((n) => n.id === pond?.netId) ?? netList.find((n) => n.isFarmDefault) ?? netList[0] ?? null
  const farmNet = netList.find((n) => n.isFarmDefault) ?? null

  const steps: Step[] = ['pond', ...(askNet ? (['net'] as Step[]) : []), 'photo', 'rim', 'result']
  const stepNo = steps.indexOf(step === 'measuring' ? 'result' : step) + 1
  const prev = (s: Step): Step | null => {
    const i = steps.indexOf(s)
    if (i <= 0) return null
    const p = steps[i - 1]!
    return p === 'pond' && startPond ? null : p
  }

  async function measure() {
    if (!scan) return
    setError(null)
    setFound(null)
    setStep('measuring')
    try {
      const netId = scan.net?.id ?? pondNet?.id ?? ''
      const r = await measureAtLeast(scan.id, { rim, netId })
      setScan(r.scan)
      setCredits(r.creditsLeft)
      setFound((r.scan.result?.shrimp ?? []).map((q) => ({ x: q.x, y: q.y })))
    } catch (e) {
      setError(e)
      setStep('rim')
    }
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

  async function save() {
    if (!scan) return
    setBusy(true)
    setError(null)
    try {
      const all = typed.trim() ? [...notes, typed.trim()] : notes
      const r = await api.saveScan(scan.id, worker ? { notes: all } : {})
      if (worker) {
        // W22: the line goes into the chat as the person; น้ำ answers there.
        const out = await sendChatText(r.chatText)
        if (out === 'sent' && closeLiff()) return
        navigate(P.closed(r.chatText), { replace: true })
        return
      }
      toast.show(`บันทึกเข้าบ่อ ${r.pondCode} แล้ว`)
      navigate(P.pond(r.pondId), { replace: true })
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  const go = (s: Step) => {
    setError(null)
    setStep(s)
  }
  const backTo = step === 'measuring' ? null : prev(step)
  const credit = worker ? `วันนี้สแกนได้อีก ${credits} รูป` : `วันนี้วัดได้อีก ${credits} รูป`
  const title = step === 'pond' || !pond ? 'สแกนกุ้ง' : `สแกนกุ้ง บ่อ ${pond.code}`
  const sub =
    step === 'pond' || !pond
      ? worker
        ? `${session.user.name} · ${fmtWeekday(session.today)}`
        : credit
      : worker
        ? `${session.user.name} · ${credit}`
        : pond.ageDays !== null
          ? `กุ้งอายุ ${pond.ageDays} วัน · ${credit}`
          : credit

  const retake = (
    <Btn kind="l" onClick={() => go('photo')}>
      ถ่ายรูปใหม่
    </Btn>
  )

  let body
  let foot
  switch (step) {
    case 'pond': {
      const mine = ponds.data.ponds.filter((p) => p.mine)
      const done = mine.filter((p) => p.photoToday).length
      body = (
        <>
          {worker ? (
            <Head2 t="สแกนบ่อไหนคะ" d={`บ่อที่${session.user.name}ดูแล · วันนี้สแกนแล้ว ${done} จาก ${mine.length}`} />
          ) : (
            <Head2 t="ถ่ายเข้าบ่อไหนคะ" d="ผลวัดไซส์จะบันทึกเข้าบ่อที่เลือก" />
          )}
          <PondPicker data={ponds.data} worker={worker} picked={pondId} onPick={(p) => setPondId(p.id)} />
          {pond && !worker && pond.caretaker ? (
            <div className="vc soft l5">
              {pond.code} · {pond.caretaker}ดูแล
            </div>
          ) : null}
          {credits <= 0 ? <WarnRow>เครดิตสแกนของฟาร์มหมดแล้วค่ะ ให้เจ้าของเติมก่อนนะคะ</WarnRow> : null}
        </>
      )
      foot = (
        <Btn disabled={!pond || credits <= 0} onClick={() => go(askNet ? 'net' : 'photo')}>
          {pond ? `ถัดไป · บ่อ ${pond.code}` : 'ถัดไป'}
        </Btn>
      )
      break
    }
    case 'net':
      body = (
        <>
          <NetAsk pondCode={pond?.code ?? ''} saved={farmNet} onSave={(s, cm) => void saveNet(s, cm)} />
          <InlineError error={error} />
        </>
      )
      foot = (
        <>
          <Btn kind="s" onClick={() => (prev('net') ? go(prev('net')!) : closeOrHome())}>
            ย้อนกลับ
          </Btn>
          <Btn disabled={!farmNet} onClick={() => go('photo')}>
            ถัดไป
          </Btn>
        </>
      )
      break
    case 'photo':
      body = (
        <>
          {pondNet ? <NetChip shape={pondNet.shape} cm={pondNet.cm} /> : null}
          <PhotoGuide />
          {picker.inputs}
          <InlineError error={error} />
        </>
      )
      foot = (
        <>
          <Btn kind="s" disabled={busy} onClick={() => (prev('photo') ? go(prev('photo')!) : closeOrHome())}>
            ย้อนกลับ
          </Btn>
          <Btn icon="cam" busy={busy} disabled={busy} onClick={picker.openCamera}>
            {busy ? 'กำลังส่งรูป…' : 'ถ่ายรูปยอ'}
          </Btn>
          <Btn kind="l" disabled={busy} onClick={picker.openGallery}>
            เลือกรูปจากเครื่องแทน
          </Btn>
        </>
      )
      break
    case 'rim': {
      const ok = rim.length === 4 && fitEllipse(rim) !== null
      body = (
        <>
          {rim.length < 4 ? (
            <Head2 t="แตะขอบพื้นยอ 4 จุด" d="แตะตรงที่ตาข่ายพื้นต่อกับผ้าข้างยอ ให้รอบวง" />
          ) : (
            <Head2 t="เส้นเหลืองตรงขอบพื้นยอไหม" d="น้ำวางให้ก่อน อาจยังไม่ตรง · ไม่ตรงตรงไหน ลากจุดนั้น หรือแตะจุดแล้วกดลูกศร" />
          )}
          {scan && photo ? <RimEditor photoUrl={photo.url} aspect={photo.aspect} pts={rim} onChange={setRim} guess={scan.rimGuess} /> : null}
          <InlineError error={error} />
        </>
      )
      foot = (
        <>
          <Btn kind="s" onClick={() => go('photo')}>
            ย้อนกลับ
          </Btn>
          <Btn disabled={!ok} onClick={() => void measure()}>
            วัดเลย
          </Btn>
          {worker ? null : retake}
        </>
      )
      break
    }
    case 'measuring':
      body =
        photo && scan ? (
          <Measuring photoUrl={photo.url} aspect={photo.aspect} rim={rim} found={found} onShown={() => setStep('result')} />
        ) : null
      foot = (
        <>
          <Btn kind="s" disabled>
            ย้อนกลับ
          </Btn>
          <Btn disabled>กำลังวัด…</Btn>
        </>
      )
      break
    case 'result': {
      const r = scan?.result
      body =
        r && photo && pond ? (
          <ResultBody
            pondCode={pond.code}
            photoUrl={photo.url}
            aspect={photo.aspect}
            r={r}
            target={farm.targetPerKg}
            onEditNet={worker ? undefined : () => setSheet(true)}
            onFixRim={() => go('rim')}
            note={worker ? undefined : `จุดไม่ตรงขอบ กดย้อนกลับไปแก้ แล้ววัดใหม่ได้อีก ${r.remeasuresLeft} ครั้ง ไม่เสียเครดิต`}
          >
            {worker ? (
              <div className="grp">
                <Head3 t={`จดเพิ่มให้${farm.ownerName}`} />
                <span className="l5 mut" style={{ marginTop: -4 }}>
                  ไม่ต้องก็ได้ค่ะ
                </span>
                <div className="chips">
                  {NOTE_CHIPS.map((t) => (
                    <Chip key={t} on={notes.includes(t)} onClick={() => setNotes((n) => (n.includes(t) ? n.filter((x) => x !== t) : [...n, t]))}>
                      {t}
                    </Chip>
                  ))}
                  <Chip on={typing} onClick={() => setTyping((v) => !v)}>
                    พิมพ์เอง
                  </Chip>
                </div>
                {typing ? (
                  <label className="inp">
                    <input value={typed} maxLength={120} onChange={(e) => setTyped(e.target.value)} aria-label="จดเพิ่มให้เจ้าของ" autoFocus />
                  </label>
                ) : null}
              </div>
            ) : null}
            <InlineError error={error} />
          </ResultBody>
        ) : null
      foot = worker ? (
        <>
          <Btn kind="s" disabled={busy} onClick={() => go('rim')}>
            แก้ขอบยอ
          </Btn>
          <Btn busy={busy} disabled={busy} onClick={() => void save()}>
            บันทึกเข้าบ่อ {pond?.code}
          </Btn>
        </>
      ) : (
        <>
          <Btn kind="s" disabled={busy} onClick={() => go('rim')}>
            ย้อนกลับ
          </Btn>
          <Btn busy={busy} disabled={busy} onClick={() => void save()}>
            บันทึกเข้าบ่อ {pond?.code}
          </Btn>
          {retake}
        </>
      )
      break
    }
  }

  return (
    <Page
      title={title}
      sub={sub}
      back={backTo ? () => go(backTo) : undefined}
      close={step !== 'measuring' && (step === 'pond' || !backTo)}
      step={[stepNo, steps.length]}
      two={step !== 'pond'}
      foot={foot}
      over={
        sheet && scan ? (
          <NetChangeSheet
            scan={scan}
            nets={netList}
            onMeasured={(r) => {
              setScan(r.scan)
              setCredits(r.creditsLeft)
            }}
            onNetAdded={() => nets.reload()}
            onClose={() => setSheet(false)}
          />
        ) : null
      }
    >
      {body}
    </Page>
  )
}
