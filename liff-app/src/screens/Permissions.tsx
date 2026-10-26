import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { PermissionKey, PermissionsPatch, PermissionsResponse } from '@/api/types'
import { Page } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { ErrorState, InlineError, Skeleton, Toggle } from '@/components/ui'
import { PeopleHead } from '@/components/people'
import { ROLE_LABEL } from '@/copy/th'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'

/** The five things a person can be allowed to do; the reminder is a notification, not an ability. */
const ABILITIES: PermissionKey[] = ['scanSelf', 'editOthers', 'measureInbox', 'farmOverview', 'printSheet']

function Row({ t, s, right, muted, custom }: { t: string; s?: string; right: ReactNode; muted?: boolean; custom?: boolean }) {
  return (
    <div className={`prw${muted ? ' mu' : ''}`}>
      <div>
        <b>
          {t}
          {custom ? <span className="ccus">ปรับเอง</span> : null}
        </b>
        {s ? <span>{s}</span> : null}
      </div>
      {right}
    </div>
  )
}

function Group({ t, s, children }: { t: string; s?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="pgh">
        <b>{t}</b>
        {s ? <span>{s}</span> : null}
      </div>
      <div className="pgr">{children}</div>
    </div>
  )
}

/**
 * สิทธิ์รายคน (O11): the role as two buttons, how many things the person can
 * do, and a switch per thing that saves the moment it is tapped.
 */
export default function Permissions() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const r = useApi(() => api.permissions(id), [id])
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const head = (name?: string) => <PeopleHead title={name ? `สิทธิ์ของ${name}` : 'สิทธิ์'} onBack={() => navigate(P.people)} />
  if (!r.data) {
    return <Page top={head()}>{r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[200, 140, 200]} />}</Page>
  }
  const d: PermissionsResponse = r.data
  const m = d.member

  const patch = async (body: PermissionsPatch, optimistic?: PermissionsResponse) => {
    setError(null)
    setBusy(true)
    const before = d
    if (optimistic) r.setData(optimistic)
    try {
      r.setData(await api.patchPermissions(id, body))
    } catch (e) {
      r.setData(before)
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  const sw = (k: PermissionKey, label: string) => (
    <Toggle on={d.perms[k]} label={label} onChange={(v) => void patch({ key: k, value: v }, { ...d, perms: { ...d.perms, [k]: v } })} />
  )
  const custom = (k: PermissionKey) => d.perms[k] !== d.defaults[k]
  const can = ABILITIES.filter((k) => d.perms[k]).length
  const customN = (Object.keys(d.perms) as PermissionKey[]).filter(custom).length
  const editable = m.role !== 'owner'

  return (
    <Page top={head(m.name)}>
      <div className="pcard">
        <div style={{ display: 'grid', gap: 2 }}>
          <b className="l2">{m.name}</b>
          <span className="l5 mut">
            {m.joined} · ดูแล {d.pondsLabel}
          </span>
        </div>
        {editable ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <b style={{ fontSize: 16, color: 'var(--ink2)' }}>บทบาท</b>
            <div className="rseg" role="radiogroup" aria-label="บทบาท">
              {(['manager', 'worker'] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={m.role === k} className={m.role === k ? 'on' : ''} disabled={busy} onClick={() => m.role !== k && void patch({ role: k })}>
                  {ROLE_LABEL[k]}
                </button>
              ))}
            </div>
            <span className="l5 mut">เปลี่ยนบทบาทแล้ว สิทธิ์ด้านล่างกลับเป็นค่าเริ่มต้นของบทบาทนั้น</span>
          </div>
        ) : null}
        <div className="psum">
          <div>
            <b>
              ทำได้ {can} จาก {ABILITIES.length} อย่าง
            </b>
            <span>{customN ? `ปรับเอง ${customN} อย่าง` : 'ตามค่าเริ่มต้นของบทบาท'}</span>
          </div>
          {customN ? (
            <button type="button" disabled={busy} onClick={() => void patch({ reset: true })}>
              คืนค่าเริ่มต้น
            </button>
          ) : null}
        </div>
      </div>
      <InlineError error={error} />
      <Group t="งานประจำวัน" s="ทุกคนในฟาร์มทำได้เสมอ">
        <Row t="ส่งรูปยอของบ่อที่ดูแล" s="ส่งในแชทให้เจ้าของวัด" right={<Icon n="check" />} />
        <Row t="ดูบ่อที่ดูแล" s="ไซส์ล่าสุด และบ่อที่ยังไม่ส่งรูป" right={<Icon n="check" />} />
      </Group>
      <Group t="สแกนกุ้ง" s="ใช้เครดิตของฟาร์ม">
        <Row t="สแกนเองได้" s="ตีขอบยอ กดวัด บันทึกเข้าบ่อ" right={sw('scanSelf', 'สแกนเองได้')} custom={custom('scanSelf')} />
        <Row t="แก้ขอบยอผลของคนอื่น" s="ผลที่ตัวเองสแกน แก้ได้เสมอ" right={sw('editOthers', 'แก้ขอบยอผลของคนอื่น')} custom={custom('editOthers')} />
        <Row t="วัดรูปที่คนอื่นส่ง" s="รูปในกล่องรูปรอสแกน" right={sw('measureInbox', 'วัดรูปที่คนอื่นส่ง')} custom={custom('measureInbox')} />
      </Group>
      <Group t="ดูข้อมูล">
        <Row t="ดูภาพรวมทั้งฟาร์ม" s="ทุกบ่อ และคิวจับ" right={sw('farmOverview', 'ดูภาพรวมทั้งฟาร์ม')} custom={custom('farmOverview')} />
        <Row t="พิมพ์ใบผลสแกน" s="เฉพาะบ่อที่ดูแล" right={sw('printSheet', 'พิมพ์ใบผลสแกน')} custom={custom('printSheet')} />
      </Group>
      <Group t="แจ้งเตือน">
        <Row t="เตือนเมื่อยังไม่ส่งรูป" s="ทุกวัน 10:00 เฉพาะบ่อที่ขาด" right={sw('remindMissing', 'เตือนเมื่อยังไม่ส่งรูป')} custom={custom('remindMissing')} />
      </Group>
      <Group t="เฉพาะเจ้าของ" s="เปิดให้คนอื่นไม่ได้">
        <Row t="เติมเครดิตสแกน" right={<Icon n="lock" />} muted />
        <Row t="เปลี่ยนบทบาทและนำคนออก" right={<Icon n="lock" />} muted />
        <Row t="ลบฟาร์ม" right={<Icon n="lock" />} muted />
      </Group>
      <span className="l5 mut" style={{ padding: '0 4px' }}>
        แต่ละสวิตช์บันทึกทันทีที่กด · {m.name}เห็นผลครั้งถัดไปที่เปิดแอป
      </span>
    </Page>
  )
}
