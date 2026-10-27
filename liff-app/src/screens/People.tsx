import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { Member } from '@/api/types'
import { Page, Sheet } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { Btn, ErrorState, InlineError, Skeleton } from '@/components/ui'
import { NamBubble, PeopleHead, PersonRow, spacedCode } from '@/components/people'
import { ROLE_LABEL } from '@/copy/th'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession, useToast } from '@/session'

/**
 * คนในฟาร์ม (O7, O7a, O10): the same parts as คนในฟาร์ม of น้องน้ำ on staging,
 * at large size. The gear opens its panel under the row, not a new page.
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

  const head = (count?: string) => <PeopleHead title="คนในฟาร์ม" count={count} onBack={() => navigate(P.overview)} />

  if (!r.data) {
    return (
      <Page top={head()} nav="people">
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

  const count = `${d.members.length} คน${d.invites.length ? ` · รอ ${d.invites.length}` : ''}`
  const uncovered = d.uncoveredZones.length ? ` · โซน ${d.uncoveredZones.join(' ')} ยังไม่มีคนดูแลนะคะ` : ''

  return (
    <Page
      top={head(count)}
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
      <NamBubble>คนในฟาร์มและคำเชิญที่ค้างอยู่ จัดการได้ที่นี่เลยค่ะ{uncovered}</NamBubble>
      <div style={{ display: 'grid', gap: 8 }}>
        {d.members.map((m) => {
          const canGear = owner && m.role !== 'owner'
          const other = m.role === 'worker' ? 'manager' : 'worker'
          return (
            <div key={m.id} style={{ display: 'grid', gap: 8 }}>
              <PersonRow m={m} onGear={canGear ? () => setGear(gear === m.id ? null : m.id) : undefined} />
              {gear === m.id ? (
                <div className="gp">
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
      {d.invites.length ? (
        <>
          <b className="eyb">คำเชิญที่ยังไม่ตอบรับ · {d.invites.length}</b>
          {d.invites.map((inv) => (
            <div className="pinv" key={inv.code}>
              <span className="si">
                <Icon n="send" />
              </span>
              <div className="tx">
                <b>{spacedCode(inv.code)}</b>
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
      {owner ? (
        <button type="button" className="icta" onClick={() => navigate(P.invite)}>
          <Icon n="plus" />
          เชิญคนเพิ่ม
        </button>
      ) : null}
      {d.activity.length ? (
        <>
          <b className="eyb">กิจกรรมล่าสุด</b>
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
