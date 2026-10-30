import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { Member } from '@/api/types'
import { Page, Sheet } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { Ava } from '@/components/avatar'
import { Btn, ErrorState, InlineError, Skeleton } from '@/components/ui'
import { RoleBadge, spacedCode } from '@/components/people'
import { ROLE_LABEL } from '@/copy/th'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession, useToast } from '@/session'

/**
 * คนในฟาร์ม (O7, O7a, O10). A tab, so no back arrow (Bear, round 2): the
 * title and the count in the plain bar, a yellow line when a zone has nobody,
 * everyone in one list with their circle, เชิญคนเพิ่ม under it, then the
 * invites still open and what happened lately. The gear opens its panel under
 * the row, not a new page.
 */
export default function People() {
  const navigate = useNavigate()
  const { session } = useSession()
  const toast = useToast()
  const r = useApi(() => api.members())
  const [gear, setGear] = useState<string | null>(null)
  const [remove, setRemove] = useState<Member | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const owner = session.role === 'owner'

  if (!r.data) {
    return (
      <Page title="คนในฟาร์ม" nav="people">
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[70, 100, 100, 100]} />}
      </Page>
    )
  }
  const d = r.data

  const act = async (fn: () => Promise<unknown>, said: string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setGear(null)
      setRemove(null)
      r.reload()
      toast.show(said)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const count = `${d.members.length} คน${d.invites.length ? ` · รอตอบรับ ${d.invites.length}` : ''}`

  return (
    <Page
      title="คนในฟาร์ม"
      sub={count}
      nav="people"
      over={
        remove ? (
          <Sheet onCancel={() => setRemove(null)} label={`นำ${remove.name}ออกจากฟาร์ม`}>
            <b className="l2">นำ{remove.name}ออกจากฟาร์มไหมคะ</b>
            <span className="l5 mut">เมนูสแกนกุ้งของ{remove.name}จะหายไปด้วย ผลที่สแกนไว้แล้วยังอยู่ในบ่อเหมือนเดิม</span>
            <InlineError error={error} />
            <Btn kind="d" busy={busy} disabled={busy} onClick={() => void act(() => api.removeMember(remove.id), `นำ${remove.name}ออกแล้ว`)}>
              นำออกจากฟาร์ม
            </Btn>
            <Btn kind="l" onClick={() => setRemove(null)}>
              ยกเลิก
            </Btn>
          </Sheet>
        ) : null
      }
    >
      {d.uncoveredZones.length ? (
        <div className="pp-warn">
          <Icon n="warn" />
          <div>
            <b>โซน {d.uncoveredZones.join(' ')} ยังไม่มีคนดูแล</b>
            {owner ? <span>แตะเฟืองที่ชื่อคน แล้วเลือก บ่อที่ดูแล หรือเชิญคนใหม่มาดูแลค่ะ</span> : null}
          </div>
        </div>
      ) : null}
      <div className="pp-list">
        {d.members.map((m) => {
          const canGear = owner && m.role !== 'owner'
          const other = m.role === 'worker' ? 'manager' : 'worker'
          const on = gear === m.id
          return (
            <div key={m.id} className={`pp-item${on ? ' on' : ''}`}>
              <div className="pp-row">
                <Ava name={m.name} size={46} src={m.pictureUrl} />
                <div className="tx">
                  <div className="nm">
                    <b>{m.name}</b>
                    <RoleBadge role={m.role} />
                  </div>
                  <span>{m.scope}</span>
                  <em>{m.joined}</em>
                </div>
                {canGear ? (
                  <button type="button" className="pp-gear" aria-expanded={on} onClick={() => setGear(on ? null : m.id)} aria-label={`แก้ไข ${m.name}`}>
                    <Icon n="gear" />
                  </button>
                ) : null}
              </div>
              {on ? (
                <div className="gp w-fade">
                  <button type="button" onClick={() => navigate(P.memberPonds(m.id))}>
                    บ่อที่ดูแล
                  </button>
                  <button type="button" onClick={() => navigate(P.permissions(m.id))}>
                    สิทธิ์
                  </button>
                  <button type="button" disabled={busy} onClick={() => void act(() => api.setRole(m.id, other), `${m.name}เป็น${ROLE_LABEL[other]}แล้ว`)}>
                    เปลี่ยนบทบาทเป็น{ROLE_LABEL[other]}
                  </button>
                  <button type="button" className="dg" onClick={() => setRemove(m)}>
                    นำออกจากฟาร์ม
                  </button>
                  <button type="button" className="cl" onClick={() => setGear(null)}>
                    ปิด
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      {!remove ? <InlineError error={error} /> : null}
      {owner ? (
        <button type="button" className="pp-cta" onClick={() => navigate(P.invite)}>
          <Icon n="plus" />
          เชิญคนเพิ่ม
        </button>
      ) : null}
      {d.invites.length ? (
        <>
          <h3 className="pp-sec">คำเชิญที่ยังไม่ตอบรับ · {d.invites.length}</h3>
          {d.invites.map((inv) => (
            <div className="pinv" key={inv.code}>
              <span className="si">
                <Icon n="send" />
              </span>
              <div className="tx">
                <b className="mono">{spacedCode(inv.code)}</b>
                <span>
                  เหลือ {inv.daysLeft} วัน · {ROLE_LABEL[inv.role]} · {inv.pondsLabel}
                </span>
              </div>
              {owner ? (
                <button type="button" className="cx" disabled={busy} onClick={() => void act(() => api.cancelInvite(inv.code), 'ยกเลิกคำเชิญแล้ว')}>
                  ยกเลิก
                </button>
              ) : null}
            </div>
          ))}
        </>
      ) : null}
      {d.activity.length ? (
        <>
          <h3 className="pp-sec">ล่าสุดในฟาร์ม</h3>
          <div className="actv">
            {d.activity.map((a, i) => (
              <div key={i}>
                <p>
                  <b>{a.who}</b>
                  <span> · {a.what}</span>
                </p>
                <em>{a.when}</em>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Page>
  )
}
