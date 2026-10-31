import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { api } from '@/api/client'
import type { Invite as InviteData, Role } from '@/api/types'
import { Page } from '@/components/Page'
import { Btn, Chip, ErrorState, Head2, Head3, InlineError, Skeleton, Tip } from '@/components/ui'
import { PeopleHead, spacedCode } from '@/components/people'
import { ROLE_LABEL, WORKER } from '@/copy/th'
import { shareInvite } from '@/lib/liff-actions'
import { fmtWeekdayShort, pondRange } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession, useToast } from '@/session'

type InviteRole = Exclude<Role, 'owner'>

const ROLE_CARDS: [InviteRole, string][] = [
  ['worker', 'สแกนกุ้งบ่อที่ดูแลทุกวัน · ดูไซส์ได้เฉพาะบ่อที่ดูแล'],
  ['manager', `สแกนได้เหมือน${WORKER} · เห็นไซส์และภาพรวมทั้งฟาร์ม · แก้ผลสแกนของทุกคน`],
]

/** The QR as a picture: no innerHTML, and the code stays readable under it. */
function Qr({ url }: { url: string }) {
  const [src, setSrc] = useState<{ url: string; data: string } | null>(null)
  useEffect(() => {
    let live = true
    QRCode.toDataURL(url, { margin: 0, width: 360, color: { dark: '#0D0C18', light: '#FFFFFF' } })
      .then((data) => {
        if (live) setSrc({ url, data })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [url])
  return src && src.url === url ? <img className="qr" src={src.data} alt="QR คำเชิญ" width={180} height={180} /> : <span className="qr sk" />
}

/** ส่งคำเชิญ (O8a): QR for face to face, the code to type, the link to copy, and ส่งทางไลน์. */
function Share({ inv, onDone }: { inv: InviteData; onDone: (said?: string) => void }) {
  const { session } = useSession()
  const [copied, setCopied] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const send = async () => {
    setNote(null)
    const out = await shareInvite({ farmName: session.farm!.name, ownerName: session.farm!.ownerName, pondsLabel: inv.pondsLabel, url: inv.url })
    if (out === 'shared') onDone('ส่งคำเชิญทางไลน์แล้วค่ะ')
    else if (out === 'unavailable') setNote('ส่งทางไลน์ได้เมื่อเปิดหน้านี้ใน LINE ค่ะ ตอนนี้ให้เขาสแกน QR หรือคัดลอกลิงก์ไปแทนนะคะ')
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inv.url)
      setCopied(true)
    } catch {
      setNote('คัดลอกไม่ได้ค่ะ กดค้างที่ลิงก์แล้วเลือกคัดลอกแทนนะคะ')
    }
  }
  const cancel = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.cancelInvite(inv.code)
      onDone('ยกเลิกคำเชิญแล้ว')
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <Page
      top={<PeopleHead title="ส่งคำเชิญ" onBack={() => onDone()} />}
      foot={
        <>
          <Btn icon="send" onClick={() => void send()}>
            ส่งทางไลน์
          </Btn>
          <Btn kind="s" onClick={() => onDone()}>
            เสร็จแล้ว
          </Btn>
          <Btn kind="d" busy={busy} disabled={busy} onClick={() => void cancel()}>
            ยกเลิกคำเชิญนี้
          </Btn>
        </>
      }
    >
      <b className="l2" style={{ textAlign: 'center' }}>
        สร้างคำเชิญเรียบร้อยค่ะ
      </b>
      <div className="qrc">
        <span className="cl">
          รหัสเชิญ · {ROLE_LABEL[inv.role]} · {inv.pondsLabel}
        </span>
        <Qr url={inv.url} />
        <b className="code">{spacedCode(inv.code)}</b>
        <span className="h">ให้เขาสแกน หรือพิมพ์รหัสนี้ก็ได้ค่ะ</span>
      </div>
      <div className="lnk">
        <div>
          <small>ลิงก์เชิญ</small>
          <span>{inv.url.replace(/^https?:\/\//, '')}</span>
        </div>
        <button type="button" onClick={() => void copy()}>
          {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
        </button>
      </div>
      <span className="l5 mut" style={{ textAlign: 'center' }}>
        ใช้ได้ถึง {fmtWeekdayShort(inv.expiresOn)} · {inv.daysLeft} วันนับจากวันนี้
      </span>
      {note ? <Tip>{note}</Tip> : null}
      <InlineError error={error} />
    </Page>
  )
}

/** ชวนคนเข้าฟาร์ม (O8): the role as cards, and which ponds the person looks after. */
export default function Invite() {
  const navigate = useNavigate()
  const toast = useToast()
  const ponds = useApi(() => api.ponds())
  const [role, setRole] = useState<InviteRole>('worker')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [zones, setZones] = useState<Set<string>>(new Set())
  const [inv, setInv] = useState<InviteData | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const back = (said?: string) => {
    if (said) toast.show(said)
    navigate(P.people)
  }

  if (inv) return <Share inv={inv} onDone={back} />

  const head = <PeopleHead title="ชวนคนเข้าฟาร์ม" onBack={() => back()} />
  if (!ponds.data) {
    return <Page top={head}>{ponds.error ? <ErrorState error={ponds.error} onRetry={ponds.reload} /> : <Skeleton rows={[60, 160, 120]} />}</Page>
  }
  const all = ponds.data.ponds

  const toggleZone = (z: string) => {
    const zs = new Set(zones)
    const inZone = all.filter((p) => p.zone === z).map((p) => p.id)
    const ps = new Set(picked)
    if (zs.has(z)) {
      zs.delete(z)
      inZone.forEach((id) => ps.delete(id))
    } else {
      zs.add(z)
      inZone.forEach((id) => ps.add(id))
    }
    setZones(zs)
    setPicked(ps)
  }
  const togglePond = (id: string) => {
    const ps = new Set(picked)
    if (ps.has(id)) ps.delete(id)
    else ps.add(id)
    setPicked(ps)
  }

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      setInv(await api.createInvite({ role, pondIds: [...picked] }))
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const chosen = all.filter((p) => picked.has(p.id))
  const needPonds = role === 'worker' && !chosen.length

  return (
    <Page
      top={head}
      foot={
        <Btn busy={busy} disabled={busy || needPonds} onClick={() => void create()}>
          สร้างคำเชิญ
        </Btn>
      }
    >
      <Head2 t="ให้สิทธิ์แบบไหนคะ" d="เปลี่ยนทีหลังได้ที่หน้าสิทธิ์รายคน" />
      <div style={{ display: 'grid', gap: 8 }} role="radiogroup" aria-label="บทบาท">
        {ROLE_CARDS.map(([k, s]) => (
          <button key={k} type="button" role="radio" aria-checked={role === k} className={`rcard${role === k ? ' on' : ''}`} onClick={() => setRole(k)}>
            <span className="rd" />
            <div>
              <b>{ROLE_LABEL[k]}</b>
              <span>{s}</span>
            </div>
          </button>
        ))}
      </div>
      <div className="grp">
        <Head3 t="ดูแลบ่อไหน" d={chosen.length ? `${chosen.length} บ่อ · ${pondRange(chosen.map((p) => p.code))}` : role === 'manager' ? 'ไม่เลือกก็ได้ ผู้จัดการเห็นทุกบ่อ' : undefined} />
        <div className="chips">
          {ponds.data.zones.map((z) => (
            <Chip key={z.zone} on={zones.has(z.zone)} onClick={() => toggleZone(z.zone)}>
              โซน {z.zone}
            </Chip>
          ))}
        </div>
        {zones.size ? (
          <div className="chips">
            {all
              .filter((p) => zones.has(p.zone))
              .map((p) => (
                <Chip key={p.id} on={picked.has(p.id)} onClick={() => togglePond(p.id)}>
                  {p.code}
                </Chip>
              ))}
          </div>
        ) : null}
      </div>
      <div className="vc soft l5">รหัสใช้ได้ 7 วัน · ยกเลิกได้ทุกเมื่อที่หน้าคนในฟาร์ม</div>
      <InlineError error={error} />
    </Page>
  )
}
