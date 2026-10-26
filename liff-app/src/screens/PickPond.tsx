import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { PondTile } from '@/api/types'
import { Page } from '@/components/Page'
import { Btn, ErrorState, Head3, InlineError, Skeleton } from '@/components/ui'
import { PondPicker } from '@/components/pond-pick'
import { closeLiff, sendChatText } from '@/lib/liff-actions'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession } from '@/session'

/**
 * เลือกบ่ออื่น (W11): when the ponds are more than the chat's quick replies.
 * The pond code goes into the chat as the person, and น้ำ asks for the photo.
 */
export default function PickPond() {
  const navigate = useNavigate()
  const { session } = useSession()
  const r = useApi(() => api.ponds())
  const [pond, setPond] = useState<PondTile | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (!pond) return
    setBusy(true)
    setError(null)
    const text = `ส่งรูปบ่อ ${pond.code}`
    const out = await sendChatText(text)
    if (out === 'sent' && closeLiff()) return
    if (out === 'failed') {
      setError(new TypeError('send'))
      setBusy(false)
      return
    }
    navigate(P.closed(text), { replace: true })
  }

  const mine = r.data?.ponds.filter((p) => p.mine) ?? []
  return (
    <Page
      title="เลือกบ่อ"
      close
      foot={
        <Btn busy={busy} disabled={!pond || busy} onClick={() => void send()}>
          {pond ? `ส่งรูปบ่อ ${pond.code}` : 'เลือกบ่อก่อนนะคะ'}
        </Btn>
      }
    >
      {r.data ? (
        <>
          <div className="zh" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Head3 t={`บ่อของ${session.user.name}`} />
            <span className="l6 mut">
              ส่งแล้ว {mine.filter((p) => p.photoToday).length}/{mine.length}
            </span>
          </div>
          <PondPicker data={r.data} worker picked={pond?.id ?? null} onPick={setPond} doneWord="ส่งแล้ว" notWord="ยังไม่ส่ง" />
        </>
      ) : r.error ? (
        <ErrorState error={r.error} onRetry={r.reload} />
      ) : (
        <Skeleton rows={[40, 220, 80]} />
      )}
      <InlineError error={error} />
    </Page>
  )
}
