import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { AskAgainReason, InboxPhoto } from '@/api/types'
import { Page } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { Btn, Chip, ErrorState, OkRow, Skeleton, WarnRow } from '@/components/ui'
import { AskAgainSheet } from '@/components/ask-again'
import { fmtTime } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession, useToast } from '@/session'

const QUALITY: Record<InboxPhoto['quality'], { ok: boolean; say: string; reason: AskAgainReason }> = {
  ok: { ok: true, say: 'รูปชัด', reason: 'other' },
  maybe_cut: { ok: false, say: 'ยออาจไม่ครบวง', reason: 'cut' },
  dark: { ok: false, say: 'รูปอาจมืด', reason: 'dark' },
  blurry: { ok: false, say: 'รูปอาจเบลอ', reason: 'blurry' },
}

/**
 * รูปรอสแกน (O13): every photo the workers sent. The owner ticks which to
 * measure; credits go only on the ones measured. A doubtful photo starts
 * unticked, with ขอใหม่ beside it (O18).
 */
export default function Inbox() {
  const navigate = useNavigate()
  const { session } = useSession()
  const toast = useToast()
  const r = useApi(() => api.inbox())
  const [sender, setSender] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [ask, setAsk] = useState<InboxPhoto | null>(null)

  if (!r.data) {
    return (
      <Page title="รูปรอสแกน" nav="inbox">
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[40, 48, 300]} />}
      </Page>
    )
  }
  const d = r.data
  const sel = picked ?? new Set(d.photos.filter((p) => QUALITY[p.quality].ok).map((p) => p.scanId))
  const shown = d.photos.filter((p) => !sender || p.by === sender)
  const ids = d.photos.filter((p) => sel.has(p.scanId)).map((p) => p.scanId)
  const toggle = (id: string) => {
    const next = new Set(sel)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }
  const over = ids.length > d.creditsLeft

  return (
    <Page
      title="รูปรอสแกน"
      nav="inbox"
      foot={
        d.photos.length ? (
          <Btn disabled={!ids.length || over} onClick={() => navigate(P.measure(ids))}>
            {ids.length ? `วัด ${ids.length} รูป · ใช้ ${ids.length} เครดิต` : 'ติ๊กรูปที่จะวัด'}
          </Btn>
        ) : undefined
      }
      over={
        ask ? (
          <AskAgainSheet
            scanId={ask.scanId}
            pondCode={ask.pondCode}
            sender={ask.by}
            ownerName={session.farm!.ownerName}
            initial={QUALITY[ask.quality].reason === 'other' ? 'cut' : QUALITY[ask.quality].reason}
            onCancel={() => setAsk(null)}
            onDone={() => {
              toast.show(`ขอรูปบ่อ ${ask.pondCode} ใหม่จาก${ask.by}แล้ว`)
              setAsk(null)
              r.reload()
            }}
          />
        ) : null
      }
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b className="l2">รูปรอสแกน {d.photos.length}</b>
        <span className="l6 mut">เหลือ {d.creditsLeft} เครดิต</span>
      </div>
      {d.photos.length ? (
        <>
          <div className="chips">
            <Chip on={!sender} onClick={() => setSender(null)}>
              ทั้งหมด
            </Chip>
            {d.senders.map((s) => (
              <Chip key={s.name} on={sender === s.name} onClick={() => setSender(s.name)}>
                {s.name} {s.n}
              </Chip>
            ))}
          </div>
          <div className="vc lst">
            {shown.map((p) => {
              const q = QUALITY[p.quality]
              const on = sel.has(p.scanId)
              return (
                <div
                  key={p.scanId}
                  className="li"
                  role="checkbox"
                  aria-checked={on}
                  tabIndex={0}
                  onClick={() => toggle(p.scanId)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault()
                      toggle(p.scanId)
                    }
                  }}
                >
                  <span className={`box${on ? ' on' : ''}`}>
                    <Icon n="check" />
                  </span>
                  <span className="thm photo" style={{ backgroundImage: `url(${p.photoUrl})` }} />
                  <span className="tx">
                    <b>บ่อ {p.pondCode}</b>
                    <span>
                      {p.by} · {fmtTime(p.at)}
                    </span>
                    {q.ok ? <OkRow>{q.say}</OkRow> : <WarnRow>{q.say}</WarnRow>}
                  </span>
                  {q.ok ? null : (
                    <button
                      type="button"
                      className="pill wn"
                      onClick={(e) => {
                        e.stopPropagation()
                        setAsk(p)
                      }}
                    >
                      ขอใหม่
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <span className="l6 mut">รูปที่ไม่ติ๊กยังอยู่ในกล่อง ไม่หักเครดิต</span>
          {over ? <WarnRow>เครดิตเหลือ {d.creditsLeft} รูป ติ๊กออกบางรูปก่อนนะคะ</WarnRow> : null}
        </>
      ) : (
        <div className="state">
          <span className="nn av-nn" aria-hidden="true" />
          <b>ไม่มีรูปรอสแกนค่ะ</b>
          <span>รูปยอที่ลูกน้องส่งในแชทจะมารอที่นี่</span>
        </div>
      )}
    </Page>
  )
}
