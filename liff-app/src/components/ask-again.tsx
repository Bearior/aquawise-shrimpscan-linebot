import { useState } from 'react'
import { api } from '@/api/client'
import type { AskAgainReason } from '@/api/types'
import { Btn, Chip, InlineError } from './ui'
import { Sheet } from './Page'

export const REASON_LABEL: Record<AskAgainReason, string> = {
  dark: 'รูปมืด',
  blurry: 'เบลอ',
  cut: 'ยอไม่ครบวง',
  pile: 'กุ้งกองทับกัน',
  other: 'อื่นๆ',
}

/**
 * ขอรูปใหม่ (O18): pick why, and น้ำ messages the person who sent the photo.
 * The old photo leaves the box and costs no credit.
 */
export function AskAgainSheet({
  scanId,
  pondCode,
  sender,
  ownerName,
  initial = 'cut',
  onDone,
  onCancel,
}: {
  scanId: string
  pondCode: string
  sender: string
  ownerName: string
  initial?: AskAgainReason
  onDone: () => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState<AskAgainReason>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.askAgain(scanId, reason)
      onDone()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }
  return (
    <Sheet onCancel={onCancel} label={`ขอรูปบ่อ ${pondCode} ใหม่`}>
      <b className="l2">
        ขอรูปบ่อ {pondCode} ใหม่จาก{sender}
      </b>
      <div className="chips">
        {(Object.keys(REASON_LABEL) as AskAgainReason[]).map((k) => (
          <Chip key={k} big on={k === reason} onClick={() => setReason(k)}>
            {REASON_LABEL[k]}
          </Chip>
        ))}
      </div>
      <div className="vc soft l5">
        น้ำจะส่งให้{sender}ว่า "{ownerName}ขอรูปบ่อ {pondCode} ใหม่ค่ะ · {REASON_LABEL[reason]}"
      </div>
      <InlineError error={error} />
      <Btn busy={busy} disabled={busy} onClick={() => void send()}>
        ส่งให้{sender}
      </Btn>
      <Btn kind="l" onClick={onCancel}>
        ยกเลิก
      </Btn>
    </Sheet>
  )
}
