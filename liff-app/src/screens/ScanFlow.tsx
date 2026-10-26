import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { Net, Pt, Scan } from '@/api/types'
import { Page, useCloseLiff } from '@/components/Page'
import { Btn, Chip, ErrorState, Head2, Head3, InlineError, Skeleton, WarnRow } from '@/components/ui'
import { PondPicker } from '@/components/pond-pick'
import { NetStep, netChoiceFrom, netChoiceWants, type NetChoice } from '@/components/nets'
import { NetChip, ResultBody, bandedShrimp } from '@/components/result'
import { NetChangeSheet } from '@/components/net-change'
import { RimEditor } from '@/components/rim'
import { Measuring, PhotoGuide, aspectOf, prepPhoto, usePhotoPicker } from '@/components/scan-steps'
import { closeLiff, sendChatText } from '@/lib/liff-actions'
import { useBlink } from '@/lib/motion'
import { fitRim } from '@/lib/rim'
import { fmtWeekday } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession, useToast } from '@/session'

type Step = 'pond' | 'net' | 'photo' | 'rim' | 'measuring' | 'result'

const NOTE_CHIPS = ['กินดี', 'กินลดลง', 'ตัวนิ่ม', 'ขี้ขาว', 'น้ำเขียวจัด']

/**
 * สแกนกุ้ง from the menu, in the steps of แบบ 2 (docs/shrimp-scan-rim-redesign,
 * M2): pond, the ยอ, photo, rim, then measuring and the result on the last
 * step. The owner answers the ยอ every time, with this pond's ยอ already
 * chosen (O19 to O19i); a worker has no ยอ step and sees it as a chip on the
 * photo step (W17 to W22).
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
  const [step, setStep] = useState<Step>(startPond ? (worker ? 'photo' : 'net') : 'pond')
  // The ยอ step's answer; null until it is touched, so it starts from the pond's ยอ.
  const [choice, setChoice] = useState<NetChoice | null>(null)
  // The ยอ this scan is measured against, once the ยอ step saved it.
  const [usedNet, setUsedNet] = useState<Net | null>(null)
  const [flash, blink] = useBlink()

  const [credits, setCredits] = useState(session.creditsLeft)
  const [scan, setScan] = useState<Scan | null>(null)
  const [photo, setPhoto] = useState<{ url: string; aspect: number } | null>(null)
  const [rim, setRim] = useState<Pt[]>([])
  const [measured, setMeasured] = useState(false)
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
    blink()
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

  if (!ponds.data || !nets.data) {
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
  const net: Net | null = usedNet ?? scan?.net ?? pondNet
  const shape = net?.shape ?? 'round'
  const pick = choice ?? netChoiceFrom(pondNet)

  const steps: Step[] = worker ? ['pond', 'photo', 'rim', 'result'] : ['pond', 'net', 'photo', 'rim', 'result']
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
    setMeasured(false)
    setStep('measuring')
    try {
      const r = await api.measure(scan.id, { rim, netId: net?.id ?? '' })
      setScan(r.scan)
      setCredits(r.creditsLeft)
      setMeasured(true)
    } catch (e) {
      setError(e)
      setStep('rim')
    }
  }

  /** ถัดไป on the ยอ step: use a saved ยอ for this pond, or save the new size for it. */
  async function saveNet() {
    const want = netChoiceWants(pick, netList)
    if (!want || !pond) return
    setBusy(true)
    setError(null)
    try {
      let n: Net
      if ('net' in want) {
        n = want.net
        if (pondNet?.id !== n.id) await api.setPondNet(pond.id, n.id)
      } else {
        n = await api.addNet({ shape: want.shape, cm: want.cm, pondId: pond.id, farmDefault: netList.length === 0 })
      }
      setUsedNet(n)
      // Back on this step, the saved ยอ is the choice: ถัดไป again must not save it twice.
      setChoice(netChoiceFrom(n))
      nets.reload()
      ponds.reload()
      go('photo')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
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
          <PondPicker
            data={ponds.data}
            worker={worker}
            picked={pondId}
            onPick={(p) => {
              setPondId(p.id)
              setChoice(null)
              setUsedNet(null)
            }}
          />
          {pond && !worker && pond.caretaker ? (
            <div className="vc soft l5">
              {pond.code} · {pond.caretaker}ดูแล
            </div>
          ) : null}
          {credits <= 0 ? <WarnRow>เครดิตสแกนของฟาร์มหมดแล้วค่ะ ให้เจ้าของเติมก่อนนะคะ</WarnRow> : null}
        </>
      )
      foot = (
        <Btn disabled={!pond || credits <= 0} onClick={() => go(steps[1]!)}>
          {pond ? `ถัดไป · บ่อ ${pond.code}` : 'ถัดไป'}
        </Btn>
      )
      break
    }
    case 'net':
      body = (
        <>
          <NetStep pondCode={pond?.code ?? ''} nets={netList} pondNet={pondNet} choice={pick} onChoice={setChoice} />
          <InlineError error={error} />
        </>
      )
      foot = (
        <>
          <Btn kind="s" disabled={busy} onClick={() => (prev('net') ? go(prev('net')!) : closeOrHome())}>
            ย้อนกลับ
          </Btn>
          <Btn busy={busy} disabled={!netChoiceWants(pick, netList) || busy} onClick={() => void saveNet()}>
            ถัดไป
          </Btn>
        </>
      )
      break
    case 'photo':
      body = (
        <>
          {worker && net ? <NetChip shape={net.shape} cm={net.cm} /> : null}
          <PhotoGuide shape={shape} />
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
      const ok = rim.length === 4 && fitRim(shape, rim) !== null
      body = (
        <>
          {scan && photo ? <RimEditor photoUrl={photo.url} aspect={photo.aspect} shape={shape} pts={rim} onChange={setRim} guess={scan.rimGuess} /> : null}
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
          <Measuring
            photoUrl={photo.url}
            aspect={photo.aspect}
            shape={shape}
            rim={rim}
            shrimp={measured && scan.result ? bandedShrimp(scan.result) : null}
            onShown={() => setStep('result')}
          />
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
      back={step === 'measuring' ? undefined : backTo ? () => go(backTo) : closeOrHome}
      step={[stepNo, steps.length]}
      two={step !== 'pond'}
      foot={foot}
      flash={flash}
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
