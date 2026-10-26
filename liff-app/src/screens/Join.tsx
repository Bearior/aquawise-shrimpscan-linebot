import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { InvitePreview } from '@/api/types'
import { Page, useCloseLiff } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { Btn, Chip, ErrorState, Head3, InlineError, Skeleton } from '@/components/ui'
import { APP_NAME, ROLE_LABEL } from '@/copy/th'
import { useLiff } from '@/lib/liff/context'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession } from '@/session'

const WHY: Record<string, string> = {
  expired: 'คำเชิญนี้หมดอายุแล้วค่ะ ขอให้เจ้าของฟาร์มส่งใหม่นะคะ',
  used: 'คำเชิญนี้ใช้ไปแล้วค่ะ ถ้าไม่ใช่พี่ ขอให้เจ้าของฟาร์มส่งใหม่นะคะ',
  cancelled: 'เจ้าของฟาร์มยกเลิกคำเชิญนี้แล้วค่ะ',
}

function Form({ inv, code }: { inv: InvitePreview; code: string }) {
  const navigate = useNavigate()
  const closeOrHome = useCloseLiff()
  const { setSession } = useSession()
  const { profile } = useLiff()
  const [name, setName] = useState(inv.suggestedName || profile?.displayName || '')
  const [lang, setLang] = useState<'th' | 'my'>(typeof navigator !== 'undefined' && navigator.language.startsWith('my') ? 'my' : 'th')
  const [addFriend, setAddFriend] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      setSession(await api.acceptInvite(code, { displayName: name.trim(), lang, addFriend }))
      navigate(P.home, { replace: true })
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <Page
      title={`คำเชิญจาก${inv.farmName}`}
      close
      foot={
        <>
          <Btn busy={busy} disabled={busy || !name.trim()} onClick={() => void accept()}>
            ตกลง เข้าร่วม
          </Btn>
          <Btn kind="l" onClick={closeOrHome}>
            ยังไม่เข้าตอนนี้
          </Btn>
        </>
      }
    >
      <div className="icr">
        <div>
          <span>ฟาร์ม</span>
          <b>
            {inv.farmName} · {inv.pondCount} บ่อ
          </b>
        </div>
        <div>
          <span>เจ้าของฟาร์ม</span>
          <b>{inv.ownerName}</b>
        </div>
        <div>
          <span>บทบาทของพี่</span>
          <b>{ROLE_LABEL[inv.role]}</b>
        </div>
        <div>
          <span>บ่อที่พี่ดูแล</span>
          <b>{inv.pondsLabel}</b>
        </div>
      </div>
      <div className="vc soft l5">
        {ROLE_LABEL[inv.role]}สแกนกุ้งและส่งรูปยอของบ่อที่ดูแล และเห็นขนาดกุ้งของบ่อนั้น · น้ำจะเห็นชื่อและรูปโปรไฟล์ LINE ของพี่
      </div>
      <div className="grp">
        <Head3 t="ชื่อที่ใช้ในฟาร์ม" />
        <label className="inp">
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="ชื่อที่ใช้ในฟาร์ม" />
        </label>
        <span className="l5 mut">ดึงจาก LINE แก้ได้ค่ะ</span>
      </div>
      <div className="grp">
        <Head3 t="ภาษาในแชท" />
        <div className="chips">
          <Chip big on={lang === 'th'} onClick={() => setLang('th')}>
            ไทย
          </Chip>
          <Chip big on={lang === 'my'} onClick={() => setLang('my')}>
            မြန်မာ
          </Chip>
        </div>
      </div>
      <button type="button" className="ck" role="checkbox" aria-checked={addFriend} onClick={() => setAddFriend((v) => !v)}>
        <span className={`box${addFriend ? ' on' : ''}`}>
          <Icon n="check" />
        </span>
        เพิ่มเพื่อน {APP_NAME}
      </button>
      <InlineError error={error} />
    </Page>
  )
}

/** หน้ารับคำเชิญ (W2): the farm, the owner, the role and ponds, the name used in the farm. */
export default function Join() {
  const [params] = useSearchParams()
  const closeOrHome = useCloseLiff()
  const code = params.get('invite') ?? ''
  const r = useApi(() => api.invite(code), [code])

  if (!code) {
    return (
      <Page title="คำเชิญ" close>
        <div className="state">
          <b>ไม่พบรหัสเชิญค่ะ</b>
          <span>เปิดจากการ์ดชวนในแชทอีกครั้ง หรือขอลิงก์ใหม่จากเจ้าของฟาร์มนะคะ</span>
        </div>
      </Page>
    )
  }
  if (!r.data) {
    return (
      <Page title="คำเชิญ" close>
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[200, 80, 120]} />}
      </Page>
    )
  }
  if (!r.data.valid) {
    return (
      <Page title="คำเชิญ" close>
        <div className="state">
          <span className="nn av-nn" aria-hidden="true" />
          <b>{WHY[r.data.reason ?? ''] ?? 'คำเชิญนี้ใช้ไม่ได้แล้วค่ะ'}</b>
          <Btn kind="s" onClick={closeOrHome}>
            กลับไปที่แชท
          </Btn>
        </div>
      </Page>
    )
  }
  return <Form key={code} inv={r.data} code={code} />
}
