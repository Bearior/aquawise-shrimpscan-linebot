import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { FarmSheet, PondSheet } from '@/api/types'
import { Page, Sheet } from '@/components/Page'
import { Btn, ErrorState, Head2, InlineError, Pill, Skeleton, XRow } from '@/components/ui'
import { A4Farm1, A4Farm2, A4Pond, Paper, Thumb } from '@/components/a4'
import { PondPicker } from '@/components/pond-pick'
import { fmtWeekdayYear } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession, useToast } from '@/session'

/** ส่งเป็นรูป: น้ำ sends the sheet into the chat as pictures, to forward to a print shop. */
function useSendSheet() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const send = async (body: Parameters<typeof api.sendSheet>[0]) => {
    setBusy(true)
    setError(null)
    try {
      const r = await api.sendSheet(body)
      toast.show(`ส่งใบสรุป ${r.sent} รูปเข้าแชทแล้ว`)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return { send, busy, error }
}

/** พิมพ์ใบสรุป (O32): which sheet. */
export function PrintPick() {
  const navigate = useNavigate()
  const { session } = useSession()
  const farm = useApi(() => api.farmSheet())
  const [pick, setPick] = useState<'farm' | 'pond'>('farm')
  const [pondSheet, setPondSheet] = useState(false)
  const ponds = useApi(() => (pondSheet ? api.ponds() : Promise.resolve(null)), [pondSheet])

  return (
    <Page
      title="พิมพ์ใบสรุป"
      back={P.overview}
      foot={<Btn onClick={() => (pick === 'farm' ? navigate(P.printFarm) : setPondSheet(true))}>ดูตัวอย่าง</Btn>}
      over={
        pondSheet ? (
          <Sheet onCancel={() => setPondSheet(false)} label="พิมพ์ใบผลสแกนบ่อไหน">
            <Head2 t="พิมพ์ใบผลสแกนบ่อไหนคะ" d="ใช้ผลสแกนล่าสุดของบ่อนั้น" />
            {ponds.data ? (
              <PondPicker data={ponds.data} picked={null} onPick={(p) => navigate(P.printPond(p.id))} doneWord="" notWord="" />
            ) : ponds.error ? (
              <InlineError error={ponds.error} />
            ) : (
              <Skeleton rows={[48, 200]} />
            )}
          </Sheet>
        ) : null
      }
    >
      <Head2 t="จะพิมพ์ใบไหนคะ" d="เปิดเป็นไฟล์ PDF ไปพิมพ์ หรือส่งเป็นรูปเข้าแชท" />
      <div style={{ display: 'grid', gap: 8 }} role="radiogroup" aria-label="ใบที่จะพิมพ์">
        <button type="button" role="radio" aria-checked={pick === 'farm'} className={`popt${pick === 'farm' ? ' on' : ''}`} onClick={() => setPick('farm')}>
          <Thumb>{farm.data ? <A4Farm1 s={farm.data} /> : null}</Thumb>
          <div>
            <b>ใบสรุปฟาร์มวันนี้</b>
            <span>A4 2 หน้า · 4 กลุ่ม คิวจับ บ่อที่ต้องตรวจ และตารางทั้ง {session.farm!.pondCount} บ่อ</span>
          </div>
        </button>
        <button type="button" role="radio" aria-checked={pick === 'pond'} className={`popt${pick === 'pond' ? ' on' : ''}`} onClick={() => setPick('pond')}>
          <Thumb>
            <span className="mpp" />
          </Thumb>
          <div>
            <b>ใบผลสแกนรายบ่อ</b>
            <span>A4 บ่อละหน้า · รูปยอ ขนาดกุ้ง การโต · ให้แพหรือคนซื้อดูได้</span>
          </div>
        </button>
      </div>
      <div className="vc">
        <XRow t="วันที่" s={fmtWeekdayYear(session.today)} right={<Pill k="sf">วันนี้</Pill>} />
      </div>
    </Page>
  )
}

/** ตัวอย่าง ใบสรุปฟาร์ม (O33): both pages, one at a time. */
export function PrintFarm() {
  const navigate = useNavigate()
  const r = useApi(() => api.farmSheet())
  const [page, setPage] = useState(0)
  const send = useSendSheet()
  const foot = (
    <>
      <Btn kind="s" busy={send.busy} disabled={send.busy || !r.data} onClick={() => void send.send({ sheet: 'farm' })}>
        ส่งเป็นรูป
      </Btn>
      <Btn icon="print" disabled={!r.data} onClick={() => navigate(P.printPaper('farm'))}>
        เปิดหน้าพิมพ์
      </Btn>
    </>
  )
  return (
    <Page title="ตัวอย่างใบสรุป" sub={`ใบสรุปฟาร์ม · หน้า ${page + 1} จาก 2`} back={P.print} two foot={foot}>
      {r.data ? (
        <div className="paperpad">
          <Paper>{page === 0 ? <A4Farm1 s={r.data} /> : <A4Farm2 s={r.data} />}</Paper>
          <div className="pdots">
            {[0, 1].map((i) => (
              <button key={i} type="button" className={i === page ? 'on' : ''} onClick={() => setPage(i)} aria-label={`หน้า ${i + 1}`} aria-current={i === page} />
            ))}
          </div>
        </div>
      ) : r.error ? (
        <ErrorState error={r.error} onRetry={r.reload} />
      ) : (
        <Skeleton rows={[420]} />
      )}
      <InlineError error={send.error} />
    </Page>
  )
}

/** ตัวอย่าง ใบผลสแกนรายบ่อ (O34). */
export function PrintPond() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const r = useApi(() => api.pondSheet(id), [id])
  const send = useSendSheet()
  const code = r.data?.pond.code ?? ''
  return (
    <Page
      title="ตัวอย่างใบผลสแกน"
      sub={code ? `บ่อ ${code} · 1 หน้า` : undefined}
      back={P.pond(id)}
      two
      foot={
        <>
          <Btn kind="s" busy={send.busy} disabled={send.busy || !r.data} onClick={() => void send.send({ sheet: 'pond', pondId: id })}>
            ส่งเป็นรูป
          </Btn>
          <Btn icon="print" disabled={!r.data} onClick={() => navigate(P.printPaper(id))}>
            เปิดหน้าพิมพ์
          </Btn>
        </>
      }
    >
      {r.data ? (
        <div className="paperpad">
          <Paper>
            <A4Pond s={r.data} />
          </Paper>
        </div>
      ) : r.error ? (
        <ErrorState error={r.error} onRetry={r.reload} />
      ) : (
        <Skeleton rows={[420]} />
      )}
      <InlineError error={send.error} />
    </Page>
  )
}

/**
 * The sheets at full size with the print button (O35). The phone's own print
 * screen takes it from here. Not certain LINE's in-app browser prints on every
 * phone: the server PDF opened in the phone's browser is the planned path.
 */
export function PrintPaper() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sheet = params.get('sheet') ?? 'farm'
  const isFarm = sheet === 'farm'
  const r = useApi<FarmSheet | PondSheet>(() => (isFarm ? api.farmSheet() : api.pondSheet(sheet)), [sheet])

  useEffect(() => {
    document.title = isFarm ? 'ใบสรุปฟาร์ม' : 'ใบผลสแกน'
  }, [isFarm])

  if (!r.data) {
    return <div className="sheetpage">{r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[600]} />}</div>
  }
  return (
    <div className="sheetpage">
      {isFarm ? (
        <>
          <A4Farm1 s={r.data as FarmSheet} />
          <A4Farm2 s={r.data as FarmSheet} />
        </>
      ) : (
        <A4Pond s={r.data as PondSheet} />
      )}
      <div className="printbar">
        <Btn kind="s" onClick={() => navigate(isFarm ? P.printFarm : P.printPond(sheet))}>
          กลับ
        </Btn>
        <Btn icon="print" onClick={() => window.print()}>
          พิมพ์
        </Btn>
      </div>
    </div>
  )
}
