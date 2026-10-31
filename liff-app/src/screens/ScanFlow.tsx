import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { Net, PondsResponse, Pt, Scan, TodayResponse } from '@/api/types'
import { Page, useCloseLiff } from '@/components/Page'
import { Btn, Chip, ErrorState, Head2, Head3, InlineError, Skeleton, WarnRow } from '@/components/ui'
import { PondGrid, PondPicker } from '@/components/pond-pick'
import { NetStep, netChoiceFrom, netChoiceWants, type NetChoice } from '@/components/nets'
import { Crop, NetChip, ResultBody, bandedShrimp } from '@/components/result'
import { NetChangeSheet } from '@/components/net-change'
import { RimEditor } from '@/components/rim'
import { Measuring, PhotoGuide, aspectOf, prepPhoto, usePhotoPicker } from '@/components/scan-steps'
import { useBlink } from '@/lib/motion'
import { fitRim } from '@/lib/rim'
import type { Band } from '@/lib/sizes'
import { fmtWeekday } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession, useToast } from '@/session'

type Step = 'pond' | 'net' | 'photo' | 'rim' | 'measuring' | 'result'

const NOTE_CHIPS = ['กินดี', 'กินลดลง', 'ตัวนิ่ม', 'ขี้ขาว', 'น้ำเขียวจัด']

/** A pond the scan can go into: from the farm (owner) or from a worker's list for today. */
interface ScanPond {
  id: string
  code: string
  netId: string | null
  photoToday: boolean
  ageDays: number | null
  caretaker: string | null
}

interface ScanList {
  /** The farm's ponds by zone, for the owner's picker; null for a worker. */
  farm: PondsResponse | null
  ponds: ScanPond[]
}

const fromToday = (t: TodayResponse): ScanList => ({
  farm: null,
  ponds: t.rows.map((r) => ({ id: r.pondId, code: r.pondCode, netId: r.netId, photoToday: r.scanId !== null, ageDays: null, caretaker: null })),
})

const fromFarm = (d: PondsResponse): ScanList => ({
  farm: d,
  ponds: d.ponds.map((p) => ({ id: p.id, code: p.code, netId: p.netId, photoToday: p.photoToday, ageDays: p.ageDays, caretaker: p.caretaker })),
})

/** The dots the measuring sweep shows: by size for the owner, one colour for a worker, who gets no sizes. */
function dotsOf(scan: Scan): { x: number; y: number; band: Band }[] | null {
  if (scan.result) return bandedShrimp(scan.result)
  return scan.found ? scan.found.map((q) => ({ x: q.x, y: q.y, band: 'm' as const })) : null
}

/**
 * สแกนกุ้ง from the menu, in the steps of แบบ 2 (docs/shrimp-scan-rim-redesign,
 * M2): pond, the ยอ, photo, rim, then measuring and the result on the last
 * step. The owner answers the ยอ every time, with this pond's ยอ already
 * chosen (O19 to O19i). A worker has no ยอ step (the ยอ is a chip on the
 * photo step), picks only from their own ponds, and never sees a size: their
 * last step shows where น้ำ found the shrimp and sends the scan to the owner
 * (W17 to W22). Nothing goes into the chat.
 */
export default function ScanFlow() {
  const { session } = useSession()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const closeOrHome = useCloseLiff()
  const toast = useToast()
  const worker = session.role === 'worker'
  const farm = session.farm!

  const list = useApi(() => (worker ? api.today().then(fromToday) : api.ponds().then(fromFarm)))
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

  if (!list.data || !nets.data) {
    const err = list.error ?? nets.error
    return (
      <Page title="สแกนกุ้ง" close>
        {err ? (
          <ErrorState
            error={err}
            onRetry={() => {
              list.reload()
              nets.reload()
            }}
          />
        ) : (
          <Skeleton rows={[60, 220, 120]} />
        )}
      </Page>
    )
  }

  const pond = list.data.ponds.find((p) => p.id === pondId) ?? null
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
      list.reload()
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
        // W22: the scan is in the pond and the owner sees it there; back to the list for the next pond.
        toast.show(`ส่งบ่อ ${r.pondCode} ให้${farm.ownerName}แล้วค่ะ`)
        navigate(P.today, { replace: true })
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
  const credit = `วันนี้วัดได้อีก ${credits} รูป`
  const title = step === 'pond' || !pond ? 'สแกนกุ้ง' : `สแกนกุ้ง บ่อ ${pond.code}`
  const sub = worker
    ? `${session.user.name} · ${fmtWeekday(session.today)}`
    : step === 'pond' || !pond
      ? credit
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
      const all = list.data.ponds
      const done = all.filter((p) => p.photoToday).length
      const onPick = (p: { id: string }) => {
        setPondId(p.id)
        setChoice(null)
        setUsedNet(null)
      }
      body = (
        <>
          {worker ? (
            <>
              <Head2 t="สแกนบ่อไหนคะ" d={`บ่อที่${session.user.name}ดูแล · วันนี้สแกนแล้ว ${done} จาก ${all.length}`} />
              <PondGrid ponds={all} picked={pondId} onPick={onPick} />
            </>
          ) : (
            <>
              <Head2 t="ถ่ายเข้าบ่อไหนคะ" d="ผลวัดไซส์จะบันทึกเข้าบ่อที่เลือก" />
              {list.data.farm ? <PondPicker data={list.data.farm} picked={pondId} onPick={onPick} /> : null}
            </>
          )}
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
            shrimp={measured ? dotsOf(scan) : null}
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
      if (worker) {
        // A worker sends the scan to the owner, with a note if they like. While they see their ponds
        // (seePonds, Bear 2026-10-31) the server sends the result and they see its sizes like the owner;
        // otherwise only where น้ำ found the shrimp. The ยอ is the owner's either way, so no ยอ change here.
        const found = scan ? dotsOf(scan) : null
        const sized = scan?.result
        const notesBlock = (
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
        )
        body =
          sized && photo && pond ? (
            <ResultBody
              pondCode={pond.code}
              photoUrl={photo.url}
              aspect={photo.aspect}
              r={sized}
              target={farm.targetPerKg}
              onFixRim={() => go('rim')}
              note={`กดส่ง ผลจะบันทึกเข้าบ่อ ${pond.code} และถึง${farm.ownerName}ทันที`}
            >
              {notesBlock}
              <InlineError error={error} />
            </ResultBody>
          ) : found && photo && pond ? (
            <div className="rbody w-fade">
              <Head2 t={`วัดบ่อ ${pond.code} เสร็จแล้วค่ะ`} d={`กดส่ง ผลจะบันทึกเข้าบ่อ ${pond.code} และถึง${farm.ownerName}ทันที`} />
              <div style={{ display: 'grid', justifyItems: 'center' }}>
                <Crop photoUrl={photo.url} aspect={photo.aspect} shape={shape} rim={rim} shrimp={found} width={220} />
              </div>
              <span className="l5 mut">จุดสีน้ำเงิน คือกุ้งที่น้ำเจอในยอ ถ้าขอบไม่ตรงพื้นยอ กดแก้ขอบยอได้ค่ะ</span>
              {notesBlock}
              <InlineError error={error} />
            </div>
          ) : null
        foot = (
          <>
            <Btn kind="s" disabled={busy} onClick={() => go('rim')}>
              แก้ขอบยอ
            </Btn>
            <Btn icon="send" busy={busy} disabled={busy} onClick={() => void save()}>
              ส่งให้{farm.ownerName}
            </Btn>
          </>
        )
        break
      }
      const r = scan?.result
      body =
        r && photo && pond ? (
          <ResultBody
            pondCode={pond.code}
            photoUrl={photo.url}
            aspect={photo.aspect}
            r={r}
            target={farm.targetPerKg}
            onEditNet={() => setSheet(true)}
            onFixRim={() => go('rim')}
            note={`จุดไม่ตรงขอบ กดย้อนกลับไปแก้ แล้ววัดใหม่ได้อีก ${r.remeasuresLeft} ครั้ง ไม่เสียเครดิต`}
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
