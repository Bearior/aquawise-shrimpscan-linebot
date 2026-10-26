import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { Page } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { Btn, Chip, Head2, Head3, InlineError, OkRow, WarnRow } from '@/components/ui'
import { WORKER } from '@/copy/th'
import { P } from '@/routes'
import { useSession } from '@/session'

type Step = 'found' | 'name' | 'ponds' | 'ready'

/** A01 to A10 style names, or 01 to 10. */
function pondSet(letter: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${letter}${String(i + 1).padStart(2, '0')}`)
}

/**
 * เริ่มใช้ (O2 to O6). Someone with a farm in น้องน้ำ (same LINE provider)
 * just confirms it. Anyone else names a farm and its ponds. No ยอ question
 * here: น้ำ asks at the first measure.
 */
export default function Start() {
  const navigate = useNavigate()
  const { session, setSession } = useSession()
  const cand = session.candidate
  const [step, setStep] = useState<Step>(session.farm ? 'ready' : cand ? 'found' : 'name')
  const [name, setName] = useState('')
  const [letter, setLetter] = useState('A')
  const [count, setCount] = useState(10)
  const [extra, setExtra] = useState<string[]>([])
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const ponds = [...pondSet(letter, count), ...extra]

  const submit = async (body: Parameters<typeof api.start>[0]) => {
    setBusy(true)
    setError(null)
    try {
      setSession(await api.start(body))
      setStep('ready')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  if (step === 'found' && cand) {
    return (
      <Page
        title="เริ่มใช้"
        close
        foot={
          <>
            <Btn busy={busy} disabled={busy} onClick={() => void submit({ useFarmId: cand.id })}>
              ใช้ฟาร์มนี้
            </Btn>
            <Btn kind="l" onClick={() => setStep('name')}>
              สร้างฟาร์มใหม่
            </Btn>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 4 }}>
          <b className="l1">เจอฟาร์มของพี่แล้วค่ะ</b>
          <span className="l5 mut">{cand.source}</span>
        </div>
        <div className="vc row" style={{ border: '2px solid #004AAD', background: '#EEF3FB' }}>
          <span className="fic">
            <Icon n="home" />
          </span>
          <div style={{ display: 'grid', flex: 1 }}>
            <b className="l2">{cand.name}</b>
            <span className="l5 mut">
              {cand.pondCount} บ่อ · {cand.zoneCount} โซน · {cand.memberCount} คน
            </span>
          </div>
          <span className="box on">
            <Icon n="check" />
          </span>
        </div>
        {cand.memberCount > 1 ? (
          <div className="vc soft l5">คนในฟาร์มนี้อีก {cand.memberCount - 1} คน ต้องเพิ่มเพื่อน OA นี้ก่อน แล้วจะได้เมนูตามบทบาทของตัวเอง</div>
        ) : null}
        <InlineError error={error} />
      </Page>
    )
  }

  if (step === 'name') {
    return (
      <Page
        title="สร้างฟาร์ม"
        back={cand ? () => setStep('found') : undefined}
        close={!cand}
        step={[1, 2]}
        foot={
          <Btn disabled={!name.trim()} onClick={() => setStep('ponds')}>
            ถัดไป
          </Btn>
        }
      >
        <Head2 t="ฟาร์มชื่ออะไรคะ" d={`ชื่อนี้${WORKER}จะเห็นในการ์ดชวน`} />
        <label className="inp">
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="ชื่อฟาร์ม" placeholder="เช่น ฟาร์มสายน้ำ" autoFocus />
        </label>
      </Page>
    )
  }

  if (step === 'ponds') {
    return (
      <Page
        title="สร้างฟาร์ม"
        back={() => setStep('name')}
        step={[2, 2]}
        two
        foot={
          <>
            <Btn kind="s" onClick={() => setStep('name')}>
              ย้อนกลับ
            </Btn>
            <Btn busy={busy} disabled={busy || !ponds.length} onClick={() => void submit({ name: name.trim(), ponds })}>
              เสร็จ
            </Btn>
          </>
        }
      >
        <Head2 t="มีบ่ออะไรบ้างคะ" d={`ตั้งชื่อตามที่${WORKER}เรียก เพิ่มทีหลังได้`} />
        <div className="vc">
          <Head3 t="สร้างเป็นชุด" />
          <div className="chips">
            {['A', 'B', 'C', ''].map((l) => (
              <Chip key={l || 'num'} on={letter === l} onClick={() => setLetter(l)}>
                {l ? `ตัวอักษร ${l}` : 'เลขอย่างเดียว'}
              </Chip>
            ))}
          </div>
          <div className="chips">
            {[5, 10, 20].map((n) => (
              <Chip key={n} on={count === n} onClick={() => setCount(n)}>
                {`${letter}01 ถึง ${letter}${String(n).padStart(2, '0')}`}
              </Chip>
            ))}
          </div>
        </div>
        <div className="grp">
          <Head3 t={`${ponds.length} บ่อ`} />
          <div className="chips">
            {ponds.map((p) => (
              <span key={p} className="cp on">
                {p}
              </span>
            ))}
          </div>
          <form
            className="inp"
            style={{ display: 'flex', gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault()
              const v = adding.trim().toUpperCase()
              if (v && !ponds.includes(v)) setExtra((x) => [...x, v])
              setAdding('')
            }}
          >
            <input value={adding} maxLength={12} onChange={(e) => setAdding(e.target.value)} aria-label="ชื่อบ่อที่จะเพิ่ม" placeholder="+ เพิ่มบ่อ" />
          </form>
        </div>
        <InlineError error={error} />
      </Page>
    )
  }

  const farm = session.farm
  return (
    <Page
      title="เริ่มใช้"
      close
      foot={
        <>
          <Btn onClick={() => navigate(P.invite)}>ชวน{WORKER}</Btn>
          <Btn kind="l" onClick={() => navigate(P.overview, { replace: true })}>
            ไว้ทีหลัง
          </Btn>
        </>
      }
    >
      <div className="donec">
        <Icon n="check" />
      </div>
      <b className="l1" style={{ textAlign: 'center' }}>
        {farm?.name ?? 'ฟาร์ม'}พร้อมแล้วค่ะ
      </b>
      <span className="l5 mut" style={{ textAlign: 'center' }}>
        ต่อไปชวน{WORKER}ให้ส่งรูปยอเข้ามา พี่จะได้แจ้งเตือนเมื่อรูปเข้า
      </span>
      <div className="vc">
        <Head3 t="ขั้นต่อไป" />
        <OkRow>ฟาร์มและบ่อ</OkRow>
        <div className="okr" style={{ color: '#4F4E62' }}>
          <Icon n="scan" />
          ขนาดยอ น้ำถามตอนวัดรูปแรก
        </div>
        <WarnRow>ชวน{WORKER}คนแรก</WarnRow>
      </div>
    </Page>
  )
}
