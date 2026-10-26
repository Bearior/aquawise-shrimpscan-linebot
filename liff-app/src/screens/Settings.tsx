import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { NotifySettings } from '@/api/types'
import { Page } from '@/components/Page'
import { ErrorState, InlineError, MBtn, Pill, Skeleton, Toggle, XRow } from '@/components/ui'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { WORKER } from '@/copy/th'

const ROWS: [keyof NotifySettings, string, string][] = [
  ['photoIn', 'รูปยอเข้า', 'รวบทุก 15 นาที เป็นข้อความเดียว'],
  ['morningSummary', 'สรุปเช้า', 'ทุกวัน 07:00'],
  ['morningSheet', 'ส่งใบสรุปเป็นรูปทุกเช้า', 'พร้อมสรุปเช้า 2 รูป'],
  ['nearTarget', 'บ่อใกล้ไซส์เป้า', 'ครั้งเดียวต่อบ่อ 5 วันก่อนถึง'],
]

/** ตั้งค่า (O25): the ยอ sizes, and what น้ำ sends on her own (each one counts against the OA quota). */
export default function Settings() {
  const navigate = useNavigate()
  const r = useApi(() => api.settings())
  const [error, setError] = useState<unknown>(null)

  if (!r.data) {
    return (
      <Page title="ตั้งค่า" back={P.overview}>
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[80, 280, 160]} />}
      </Page>
    )
  }
  const d = r.data
  const flip = async (k: keyof NotifySettings, v: boolean) => {
    setError(null)
    const before = d
    r.setData({ ...d, notify: { ...d.notify, [k]: v } })
    try {
      r.setData(await api.saveNotify({ [k]: v }))
    } catch (e) {
      r.setData(before)
      setError(e)
    }
  }
  const t = (k: keyof NotifySettings, label: string) => <Toggle on={d.notify[k]} onChange={(v) => void flip(k, v)} label={label} />
  const sizes = d.nets.sizes.join(' และ ')

  return (
    <Page title="ตั้งค่า" back={P.overview}>
      <div className="vc">
        <XRow
          t="ยอของฟาร์ม"
          s={d.nets.count ? `จำไว้ ${d.nets.count} ขนาด · ${sizes} ซม.` : 'ยังไม่มี น้ำจะถามตอนวัดรูปแรก'}
          right={<MBtn onClick={() => navigate(P.nets)}>ดู</MBtn>}
        />
      </div>
      <div className="vc">
        {ROWS.map(([k, label, s]) => (
          <XRow key={k} t={label} s={s} right={t(k, label)} />
        ))}
      </div>
      <div className="vc">
        <XRow t={`เตือน${WORKER}ที่ยังไม่ส่ง`} s="ทุกวัน 10:00 เฉพาะคนที่ขาด" right={t('remindWorkers', `เตือน${WORKER}ที่ยังไม่ส่ง`)} />
        <XRow t={`ส่งผลวัดให้${WORKER}`} s="ตั้งรายคน ในหน้าคนในฟาร์ม" right={<Pill k="sf">รายคน</Pill>} />
      </div>
      <InlineError error={error} />
      <div className="vc soft l5">ข้อความที่น้ำทักไปเองนับรวมในโควตาข้อความของ AquaWise การตอบกลับเมื่อพี่กดหรือพิมพ์ไม่นับ</div>
      <button type="button" className="vbtn l" onClick={() => navigate(P.me)}>
        ข้อมูลสำหรับทีมงาน
      </button>
    </Page>
  )
}
