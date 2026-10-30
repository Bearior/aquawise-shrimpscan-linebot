import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { Page } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { CountStepper, PondNameSheet, ZoneNameSheet } from '@/components/farm-layout'
import { Btn, InlineError } from '@/components/ui'
import { WORKER } from '@/copy/th'
import { ApiError } from '@/lib/api-fetch'
import { MAX_PER_ZONE, MAX_PONDS, defaultCode, nextZoneLetter, zoneLabel } from '@/lib/farm-layout'
import { P } from '@/routes'
import { useSession } from '@/session'
import welcomeBand from '@/assets/onboarding/welcome-band.webp'
import celebrateBand from '@/assets/onboarding/celebrate-band.webp'

type Step = 'found' | 'gate' | 'name' | 'zones' | 'ready'

/**
 * One zone of the farm: its letter, its name if the owner gave one ('' while
 * not), how many ponds, and any pond renamed (by place in the zone).
 */
interface Zone {
  letter: string
  name: string
  count: number
  names: Record<number, string>
}

const CODE_KEY = 'ss.joinCode'

const pondName = (z: Zone, i: number) => z.names[i] ?? defaultCode(z.letter, i)
const pondsOf = (z: Zone) => Array.from({ length: z.count }, (_, i) => pondName(z, i))

function readCode(): string {
  try {
    return sessionStorage.getItem(CODE_KEY) ?? ''
  } catch {
    return ''
  }
}
function keepCode(code: string | null) {
  try {
    if (code) sessionStorage.setItem(CODE_KEY, code)
    else sessionStorage.removeItem(CODE_KEY)
  } catch {
    // A webview with storage off asks for the code again next time; nothing breaks.
  }
}

/** The big code box (line-bot's CodeInput): one line, mono, blue when filled, red when refused. */
function CodeField({ value, onChange, bad, label, max }: { value: string; onChange: (v: string) => void; bad: boolean; label: string; max: number }) {
  return (
    <input
      className={`ob-code mono${bad ? ' bad' : ''}${value ? ' on' : ''}`}
      value={value}
      maxLength={max}
      onChange={(e) => onChange(e.target.value.toUpperCase().replace(/\s+/g, ''))}
      aria-label={label}
      aria-invalid={bad || undefined}
      autoCapitalize="characters"
      autoComplete="off"
      spellCheck={false}
      autoFocus
    />
  )
}

/** A picture across the top that fades into the page, with น้ำ's line on it. */
function Hero({ img, children, tall }: { img: string; children?: ReactNode; tall?: boolean }) {
  return (
    <div className={`ob-hero${tall ? ' tall' : ''}`} style={{ backgroundImage: `url(${img})` }}>
      {children ? <p className="ob-say">{children}</p> : null}
      <span className="ob-fade" />
    </div>
  )
}

/**
 * เริ่มใช้ (O2 to O6), round 2 (Bear, 2026-10-30):
 *
 * 1. รหัสเข้าร่วม first, the way น้องน้ำ's beta gate works. Someone a farm
 *    invited types their invite code on the same page and goes to the invite.
 * 2. The farm's name, in line-bot's name field.
 * 3. Zones and ponds on one page (Codex concept z1,
 *    docs/shrimpscan-onboarding-zones): a card a zone with − and + for its
 *    ponds, the ponds as chips (a tap renames one), + เพิ่มโซน under them.
 *    Round 3 (Bear, 2026-10-31): a tap on โซน A names the zone. The name is
 *    never asked for and never fixed: blank reads โซน A, and the owner can
 *    change it any day on แก้ไขโซนและบ่อ.
 * 4. Done, after line-bot's FarmCreated: the picture, what is ready, what next.
 *
 * Someone with a farm in น้องน้ำ (same LINE provider) just confirms it.
 */
export default function Start() {
  const navigate = useNavigate()
  const { session, setSession } = useSession()
  const cand = session.candidate
  const [step, setStep] = useState<Step>(session.farm ? 'ready' : cand ? 'found' : readCode() ? 'name' : 'gate')
  const [code, setCode] = useState(readCode)
  const [invite, setInvite] = useState(false)
  const [codeBad, setCodeBad] = useState(false)
  const [name, setName] = useState('')
  const [zones, setZones] = useState<Zone[]>([{ letter: 'A', name: '', count: 10, names: {} }])
  const [rename, setRename] = useState<{ zone: number; i: number } | null>(null)
  const [naming, setNaming] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const ponds = zones.flatMap(pondsOf)
  const total = ponds.length

  const submit = async (body: Parameters<typeof api.start>[0]) => {
    setBusy(true)
    setError(null)
    try {
      setSession(await api.start(body))
      keepCode(null)
      setStep('ready')
    } catch (e) {
      // The code changed after this person passed the gate: ask for it again.
      if (e instanceof ApiError && e.message === 'code_required') {
        keepCode(null)
        setCodeBad(true)
        setStep('gate')
      } else setError(e)
    } finally {
      setBusy(false)
    }
  }

  const checkCode = async () => {
    const c = code.trim()
    if (!c) return
    if (invite) {
      navigate(P.join(c))
      return
    }
    setBusy(true)
    setCodeBad(false)
    setError(null)
    try {
      await api.gate(c)
      keepCode(c)
      setStep('name')
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setCodeBad(true)
      else setError(e)
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
            <Btn kind="l" onClick={() => setStep(readCode() ? 'name' : 'gate')}>
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

  if (step === 'gate') {
    return (
      <Page
        top={null}
        foot={
          <Btn busy={busy} disabled={busy || !code.trim()} onClick={() => void checkCode()}>
            {invite ? 'ดูคำเชิญ' : 'เริ่มใช้งาน'}
          </Btn>
        }
      >
        <Hero img={welcomeBand} tall>
          สวัสดีค่ะ น้ำเองค่ะ
        </Hero>
        <div className="ob-head">
          <h1>{invite ? 'ใส่รหัสเชิญที่ได้รับ' : 'ให้น้ำช่วยวัดกุ้งทุกบ่อ ทุกเช้า'}</h1>
          <p>{invite ? 'รหัสอยู่ในการ์ดชวนที่เจ้าของฟาร์มส่งมาใน LINE ค่ะ' : 'ตอนนี้เปิดให้ฟาร์มที่ได้รหัสเข้าร่วมก่อนค่ะ'}</p>
        </div>
        <form
          className="ob-field"
          onSubmit={(e) => {
            e.preventDefault()
            void checkCode()
          }}
        >
          <span className="ob-lbl">{invite ? 'รหัสเชิญ' : 'รหัสเข้าร่วม'}</span>
          <CodeField
            value={code}
            onChange={(v) => {
              setCode(v)
              setCodeBad(false)
            }}
            bad={codeBad}
            label={invite ? 'รหัสเชิญ' : 'รหัสเข้าร่วม'}
            max={invite ? 12 : 32}
          />
          {codeBad ? (
            <span className="ob-bad" role="alert">
              <Icon n="warn" />
              <span>
                <b>รหัสนี้ยังใช้ไม่ได้</b> ลองพิมพ์ใหม่อีกครั้งนะคะ
              </span>
            </span>
          ) : null}
        </form>
        <button
          type="button"
          className="ob-link"
          onClick={() => {
            setInvite(!invite)
            setCode('')
            setCodeBad(false)
          }}
        >
          {invite ? 'มีรหัสเข้าร่วม? ใส่ที่นี่' : 'มีคนชวนเข้าฟาร์ม? ใส่รหัสเชิญที่นี่'}
        </button>
        <InlineError error={error} />
      </Page>
    )
  }

  if (step === 'name') {
    return (
      <Page
        title="สร้างฟาร์ม"
        back={() => setStep(cand ? 'found' : 'gate')}
        step={[1, 2]}
        foot={
          <Btn disabled={!name.trim()} onClick={() => setStep('zones')}>
            ถัดไป
          </Btn>
        }
      >
        <div className="ob-head">
          <h1>ตั้งชื่อฟาร์มของพี่</h1>
          <p>ใส่ชื่อที่พี่เรียกติดปาก ไม่ต้องเป็นทางการค่ะ {WORKER}จะเห็นชื่อนี้ในการ์ดชวน</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) setStep('zones')
          }}
        >
          <input
            className={`ob-input${name.trim() ? ' on' : ''}`}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            aria-label="ชื่อฟาร์ม"
            placeholder="เช่น ฟาร์มสายน้ำ"
            autoFocus
          />
        </form>
      </Page>
    )
  }

  if (step === 'zones') {
    const used = new Set(ponds.map((p) => p.toUpperCase()))
    const setZone = (i: number, z: Partial<Zone>) => setZones((zs) => zs.map((x, j) => (j === i ? { ...x, ...z } : x)))
    const setCount = (i: number, n: number) => {
      const others = total - zones[i]!.count
      setZone(i, { count: Math.max(1, Math.min(MAX_PER_ZONE, MAX_PONDS - others, Math.round(n) || 1)) })
    }
    const nextLetter = nextZoneLetter(zones.map((z) => z.letter))
    const r = rename ? zones[rename.zone]! : null
    const nz = naming !== null ? zones[naming]! : null
    // A renamed pond can meet one + adds later (A11 renamed, then the 11th pond).
    const dup = ponds.find((p, i) => ponds.findIndex((q) => q.toUpperCase() === p.toUpperCase()) !== i) ?? null
    const saveRename = (code: string) => {
      if (!rename || !r) return
      const names = { ...r.names }
      // Typed back to its own A01 name: not a rename any more.
      if (code === defaultCode(r.letter, rename.i)) delete names[rename.i]
      else names[rename.i] = code
      setZone(rename.zone, { names })
      setRename(null)
    }
    const zoneNames = Object.fromEntries(zones.filter((z) => z.name).map((z) => [z.letter, z.name]))

    return (
      <Page
        title="สร้างฟาร์ม"
        back={() => setStep('name')}
        step={[2, 2]}
        foot={
          <Btn busy={busy} disabled={busy || !total || Boolean(dup)} onClick={() => void submit({ name: name.trim(), ponds, zoneNames, code: readCode() || code.trim() || undefined })}>
            เสร็จ · {total} บ่อ
          </Btn>
        }
        over={
          rename && r ? (
            <PondNameSheet zone={r.letter} current={pondName(r, rename.i)} taken={(c) => used.has(c.toUpperCase())} onSave={saveRename} onCancel={() => setRename(null)} />
          ) : nz && naming !== null ? (
            <ZoneNameSheet
              zone={nz.letter}
              name={nz.name || null}
              onSave={(n) => {
                setZone(naming, { name: n })
                setNaming(null)
              }}
              onCancel={() => setNaming(null)}
            />
          ) : null
        }
      >
        <div className="ob-head">
          <h1>โซนและบ่อของพี่</h1>
          <p>เพิ่มโซน แล้วบอกว่ามีกี่บ่อ ชื่อโซนจะตั้งหรือไม่ตั้งก็ได้ แก้ทีหลังได้ค่ะ</p>
        </div>
        <span className="ob-sum">
          <b className="mono">{zones.length}</b> โซน · <b className="mono">{total}</b> บ่อ
        </span>
        {zones.map((z, i) => (
          <section className="ob-zone" key={z.letter} aria-label={zoneLabel(z.letter, z.name)}>
            <div className="ob-zh">
              <span className="ob-zl" aria-hidden="true">
                {z.letter}
              </span>
              <button type="button" className="pe-zn" onClick={() => setNaming(i)} aria-label={`ตั้งชื่อ${zoneLabel(z.letter, z.name)}`}>
                <b>{zoneLabel(z.letter, z.name)}</b>
                <Icon n="edit" />
              </button>
              <CountStepper value={z.count} onCount={(n) => setCount(i, n)} max={Math.min(MAX_PER_ZONE, z.count + MAX_PONDS - total)} label={`บ่อในโซน ${z.letter}`} />
              <span className="ob-u">บ่อ</span>
            </div>
            <div className="ob-chips">
              {pondsOf(z).map((p, j) => (
                <button key={j} type="button" className={`mono${z.names[j] ? ' rn' : ''}`} onClick={() => setRename({ zone: i, i: j })} aria-label={`บ่อ ${p} แตะเพื่อเปลี่ยนชื่อ`}>
                  {p}
                </button>
              ))}
            </div>
            <div className="ob-zf">
              <span>
                <Icon n="edit" />
                แตะชื่อโซนหรือชื่อบ่อเพื่อเปลี่ยน
              </span>
              {zones.length > 1 ? (
                <button type="button" onClick={() => setZones((zs) => zs.filter((_, j) => j !== i))}>
                  ลบโซนนี้
                </button>
              ) : null}
            </div>
          </section>
        ))}
        {nextLetter && total < MAX_PONDS ? (
          <button type="button" className="ob-add" onClick={() => setZones((zs) => [...zs, { letter: nextLetter, name: '', count: Math.min(10, MAX_PONDS - total), names: {} }])}>
            <Icon n="plus" />
            เพิ่มโซน {nextLetter}
          </button>
        ) : null}
        {dup ? <span className="fielderr">มีบ่อชื่อ {dup} สองบ่อ เปลี่ยนชื่อบ่อหนึ่งก่อนนะคะ</span> : null}
        <InlineError error={error} />
      </Page>
    )
  }

  const farm = session.farm
  return (
    <Page
      top={null}
      foot={
        <>
          <Btn onClick={() => navigate(P.invite)}>ชวน{WORKER}เข้าฟาร์ม</Btn>
          <Btn kind="l" onClick={() => navigate(P.overview, { replace: true })}>
            ไว้ทีหลัง ไปหน้าฟาร์ม
          </Btn>
        </>
      }
    >
      <Hero img={celebrateBand} />
      <div className="ob-done">
        <span className="ob-ok" aria-hidden="true">
          <Icon n="check" />
        </span>
        <h1>{farm?.name ?? 'ฟาร์ม'}พร้อมแล้วค่ะ</h1>
        {farm ? (
          <span className="ob-sum">
            <b className="mono">{farm.zoneCount}</b> โซน · <b className="mono">{farm.pondCount}</b> บ่อ
          </span>
        ) : null}
      </div>
      <ol className="ob-next" aria-label="ขั้นต่อไป">
        <li className="ok">
          <span className="n">
            <Icon n="check" />
          </span>
          <div>
            <b>ฟาร์มและบ่อ</b>
            <span>เพิ่มหรือเปลี่ยนชื่อบ่อทีหลังได้</span>
          </div>
        </li>
        <li>
          <span className="n mono">2</span>
          <div>
            <b>ชวน{WORKER}เข้าฟาร์ม</b>
            <span>แล้วเลือกบ่อที่แต่ละคนสแกนทุกเช้า พี่จะเห็นว่าใครสแกนแล้ว</span>
          </div>
        </li>
        <li>
          <span className="n mono">3</span>
          <div>
            <b>สแกนบ่อแรก</b>
            <span>ขนาดยอ น้ำถามตอนวัดรูปแรกค่ะ</span>
          </div>
        </li>
      </ol>
    </Page>
  )
}
