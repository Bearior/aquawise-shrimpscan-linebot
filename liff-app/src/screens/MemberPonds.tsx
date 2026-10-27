import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import { Page } from '@/components/Page'
import { Btn, Chip, ErrorState, Head3, InlineError, Skeleton, WarnRow } from '@/components/ui'
import { PeopleHead } from '@/components/people'
import { pondRange } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useToast } from '@/session'

/**
 * บ่อที่ดูแล (O40): the owner picks which ponds one person scans every day.
 * A pond has one caretaker, so picking a pond someone else has moves it.
 */
export default function MemberPonds() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const r = useApi(() => api.memberPonds(id), [id])
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const backTo = params.get('from') === 'team' ? P.team : P.people

  const head = (name?: string) => <PeopleHead title={name ? `บ่อที่${name}ดูแล` : 'บ่อที่ดูแล'} onBack={() => navigate(backTo)} />
  if (!r.data) {
    return <Page top={head()}>{r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[60, 220, 220]} />}</Page>
  }
  const d = r.data
  const m = d.member
  const sel = picked ?? new Set(d.pondIds)
  const zones = [...new Set(d.ponds.map((p) => p.zone))]
  const chosen = d.ponds.filter((p) => sel.has(p.id))
  const changed = chosen.length !== d.pondIds.length || chosen.some((p) => !d.pondIds.includes(p.id))
  // Ponds that leave someone else, by who has them now.
  const moving = new Map<string, string[]>()
  for (const p of chosen) {
    if (p.heldBy && !d.pondIds.includes(p.id)) moving.set(p.heldBy, [...(moving.get(p.heldBy) ?? []), p.code])
  }

  const toggle = (ids: string[], on: boolean) => {
    const next = new Set(sel)
    ids.forEach((x) => (on ? next.add(x) : next.delete(x)))
    setPicked(next)
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.setMemberPonds(m.id, [...sel])
      toast.show(`บันทึกบ่อของ${m.name}แล้ว`)
      navigate(backTo)
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <Page
      top={head(m.name)}
      foot={
        <Btn busy={busy} disabled={busy || !changed} onClick={() => void save()}>
          {changed ? `บันทึก ${chosen.length} บ่อ` : 'ยังไม่ได้เปลี่ยน'}
        </Btn>
      }
    >
      <Head3
        t={`${m.name}สแกนบ่อไหนทุกวัน`}
        d={chosen.length ? `${chosen.length} บ่อ · ${pondRange(chosen.map((p) => p.code))}` : 'ยังไม่ได้เลือกบ่อ'}
      />
      {zones.map((z) => {
        const inZone = d.ponds.filter((p) => p.zone === z)
        const all = inZone.every((p) => sel.has(p.id))
        return (
          <div className="grp" key={z}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b className="l3">โซน {z}</b>
              <Chip on={all} onClick={() => toggle(inZone.map((p) => p.id), !all)}>
                {all ? 'เอาออกทั้งโซน' : 'เลือกทั้งโซน'}
              </Chip>
            </div>
            <div className="chips">
              {inZone.map((p) => (
                <Chip key={p.id} on={sel.has(p.id)} onClick={() => toggle([p.id], !sel.has(p.id))}>
                  {p.code}
                  {p.heldBy && !sel.has(p.id) ? ` · ${p.heldBy}` : ''}
                </Chip>
              ))}
            </div>
          </div>
        )
      })}
      {[...moving].map(([from, codes]) => (
        <WarnRow key={from}>
          {pondRange(codes)} จะย้ายจาก{from}มาให้{m.name}
        </WarnRow>
      ))}
      <InlineError error={error} />
    </Page>
  )
}
