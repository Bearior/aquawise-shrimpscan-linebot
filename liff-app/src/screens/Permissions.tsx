import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { PermissionKey, PermissionsPatch, PermissionsResponse } from '@/api/types'
import { Page } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { ErrorState, InlineError, MBtn, Skeleton, Toggle } from '@/components/ui'
import { PeopleHead } from '@/components/people'
import { ROLE_LABEL } from '@/copy/th'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'

/**
 * The things a manager can be allowed to do beyond scanning their ponds; the
 * reminder is a notification, not an ability. All four reach past the
 * person's own ponds, so none is open to a worker. A worker's one switch is
 * seePonds: the numbers of the ponds they look after (Bear, 2026-10-31).
 */
const ABILITIES: PermissionKey[] = ['editOthers', 'measureInbox', 'farmOverview', 'printSheet']

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
  const worker = m.role === 'worker'

  return (
    <Page top={head(m.name)}>
      <div className="pcard">
        <div style={{ display: 'grid', gap: 2 }}>
          <b className="l2">{m.name}</b>
          <span className="l5 mut">
            {m.joined} · ดูแล {d.pondsLabel}
          </span>
          {editable ? (
            <MBtn icon="list" onClick={() => navigate(P.memberPonds(m.id))}>
              เปลี่ยนบ่อที่ดูแล
            </MBtn>
          ) : null}
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
            <b>{worker ? (d.perms.seePonds ? 'สแกน และดูบ่อที่ดูแล' : 'สแกนอย่างเดียว') : `ทำได้ ${can} จาก ${ABILITIES.length} อย่าง`}</b>
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
        <Row t="สแกนกุ้งบ่อที่ดูแลทุกวัน" s="ตีขอบยอ กดวัด บันทึกเข้าบ่อ ผลถึงเจ้าของทันที" right={<Icon n="check" />} />
        <Row t="ดูว่าวันนี้ต้องสแกนบ่อไหน" s="บ่อที่ดูแล และบ่อที่ยังไม่สแกน" right={<Icon n="check" />} />
      </Group>
      {worker ? (
        <Group t="ดูข้อมูล">
          <Row t="ดูข้อมูลบ่อที่ดูแล" s="ไซส์ กราฟการโต และประวัติสแกน ดูได้อย่างเดียว" right={sw('seePonds', 'ดูข้อมูลบ่อที่ดูแล')} custom={custom('seePonds')} />
          <Row t="ดูบ่ออื่นและภาพรวมทั้งฟาร์ม" s={`${ROLE_LABEL.worker}ไม่เห็น ถ้าอยากให้เห็น เปลี่ยนบทบาทเป็นผู้จัดการ`} right={<Icon n="lock" />} muted />
        </Group>
      ) : (
        <>
          <Group t="ผลสแกน" s="ใช้เครดิตของฟาร์ม">
            <Row t="แก้ขอบยอผลของคนอื่น" s="ผลที่ตัวเองสแกน แก้ได้เสมอ" right={sw('editOthers', 'แก้ขอบยอผลของคนอื่น')} custom={custom('editOthers')} />
            <Row t="วัดรูปที่คนอื่นส่ง" s="รูปในกล่องรูปรอสแกน" right={sw('measureInbox', 'วัดรูปที่คนอื่นส่ง')} custom={custom('measureInbox')} />
          </Group>
          <Group t="ดูข้อมูล">
            <Row t="ดูภาพรวมทั้งฟาร์ม" s="ทุกบ่อ คิวจับ และใครสแกนแล้ว" right={sw('farmOverview', 'ดูภาพรวมทั้งฟาร์ม')} custom={custom('farmOverview')} />
            <Row t="พิมพ์ใบผลสแกน" s="เฉพาะบ่อที่ดูแล" right={sw('printSheet', 'พิมพ์ใบผลสแกน')} custom={custom('printSheet')} />
          </Group>
        </>
      )}
      <Group t="แจ้งเตือน">
        <Row t="เตือนเมื่อยังไม่สแกน" s="ทุกวัน 10:00 เฉพาะบ่อที่ขาด" right={sw('remindMissing', 'เตือนเมื่อยังไม่สแกน')} custom={custom('remindMissing')} />
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
