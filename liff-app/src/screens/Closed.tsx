import { useNavigate, useSearchParams } from 'react-router-dom'
import { Btn } from '@/components/ui'
import { MOCK } from '@/lib/mock-persona'
import { P } from '@/routes'

/**
 * Where a LIFF that "closes back to the chat" lands outside LINE (the mock, a
 * desktop browser): says what would have gone into the chat.
 */
export default function Closed() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const said = params.get('said')
  return (
    <div className="scr liff xl closed">
      <div className="state">
        <span className="nn av-nn" aria-hidden="true" />
        <b>หน้านี้ปิดกลับไปที่แชทแล้ว</b>
        {said ? (
          <>
            <span>ใน LINE ข้อความนี้จะขึ้นในแชทในนามพี่</span>
            <span className="bub">{said}</span>
          </>
        ) : null}
        {MOCK ? <span className="l6 mut">mock · ใน LINE จริงหน้าต่างนี้จะปิดเอง</span> : null}
        <Btn kind="s" onClick={() => navigate(P.home, { replace: true })}>
          เปิดแอปอีกครั้ง
        </Btn>
      </div>
    </div>
  )
}
