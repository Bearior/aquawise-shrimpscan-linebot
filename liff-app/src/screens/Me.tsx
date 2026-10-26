import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { Page } from '@/components/Page'
import { Btn, Chip, ErrorState, Head3, Skeleton, XRow } from '@/components/ui'
import { ROLE_LABEL } from '@/copy/th'
import { useLiff } from '@/lib/liff/context'
import { MOCK, mockPersona, setMockPersona, type MockPersona } from '@/lib/mock-persona'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession } from '@/session'

const PERSONAS: [MockPersona, string][] = [
  ['owner', 'เจ้าของ (พี่วิชัย)'],
  ['worker', 'ลูกน้อง (ช่างเอก)'],
  ['new', 'มีฟาร์มในน้องน้ำ'],
  ['fresh', 'ยังไม่มีฟาร์ม'],
]

/**
 * For the team, not farmers: is the token accepted, which env, which build.
 * In the mock it also switches who you are.
 */
export default function Me() {
  const navigate = useNavigate()
  const { session } = useSession()
  const liff = useLiff()
  const me = useApi(() => api.me())
  const build = document.querySelector('meta[name="build-id"]')?.getAttribute('content') ?? 'dev'

  return (
    <Page title="ข้อมูลสำหรับทีมงาน" back={P.home}>
      <div className="vc">
        <XRow t="ชื่อ" s={session.user.name} right={<span />} />
        <XRow t="ฟาร์ม" s={session.farm ? `${session.farm.name} · ${session.role ? ROLE_LABEL[session.role] : ''}` : 'ยังไม่มี'} right={<span />} />
        <XRow t="env" s={session.env} right={<span />} />
        <XRow t="build" s={build} right={<span />} />
        <XRow t="ใน LINE" s={liff.isInClient ? 'ใช่' : 'ไม่ใช่'} right={<span />} />
      </div>
      <div className="vc">
        <Head3 t="ตรวจ token กับ server" />
        {me.data ? (
          <span className="l5">ผ่าน · {me.data.env}</span>
        ) : me.error ? (
          <ErrorState error={me.error} onRetry={me.reload} />
        ) : (
          <Skeleton rows={[24]} />
        )}
      </div>
      {MOCK ? (
        <div className="vc">
          <Head3 t="mock · เปลี่ยนคน" d="โหลดหน้าใหม่ด้วยข้อมูลของคนนี้" />
          <div className="chips">
            {PERSONAS.map(([k, l]) => (
              <Chip
                key={k}
                on={mockPersona() === k}
                onClick={() => {
                  setMockPersona(k)
                  window.location.assign(`${P.home}?as=${k}`)
                }}
              >
                {l}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
      <Btn kind="l" onClick={() => navigate(P.home)}>
        กลับ
      </Btn>
    </Page>
  )
}
