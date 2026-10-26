import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { PondStatus, PondTile } from '@/api/types'
import { Page } from '@/components/Page'
import { Chip, ErrorState, Skeleton } from '@/components/ui'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'

type Filter = 'all' | 'ready' | 'watch' | 'urgent' | 'good'

const KIND: Record<PondStatus, string> = { ready: 'r', good: 'g', watch: 'w', urgent: 'u', missing: 'm' }

function stateWord(p: PondTile): string {
  if (p.status === 'urgent') return 'ต้องดู'
  if (p.status === 'missing') return 'ไม่ส่งรูป'
  if (p.status === 'watch') return 'เฝ้าระวัง'
  if (p.daysToTarget === null) return 'ยังไม่รู้'
  return p.daysToTarget <= 0 ? 'วันนี้' : `อีก ${p.daysToTarget} วัน`
}

/** In a filter, 'urgent' covers the ponds with no photo today too (the ต้องดู tile counts both). */
function inFilter(p: PondTile, f: Filter): boolean {
  if (f === 'all') return true
  if (f === 'urgent') return p.status === 'urgent' || p.status === 'missing'
  return p.status === f
}

/** รายบ่อ (O22): every pond by zone, three to a row, the state said in words. */
export default function Ponds() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const f = (params.get('f') as Filter | null) ?? 'all'
  const r = useApi(() => api.ponds())

  if (!r.data) {
    return (
      <Page title="รายบ่อ" nav="ponds">
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[48, 260, 260]} />}
      </Page>
    )
  }
  const { ponds, zones } = r.data
  const count = (x: Filter) => ponds.filter((p) => inFilter(p, x)).length
  const chips: [Filter, string][] = [
    ['all', `ทั้งหมด ${ponds.length}`],
    ['ready', `พร้อมจับ ${count('ready')}`],
    ['watch', `เฝ้าระวัง ${count('watch')}`],
    ['urgent', `ต้องดู ${count('urgent')}`],
  ]
  if (f === 'good') chips.push(['good', `โตดี ${count('good')}`])

  return (
    <Page title="รายบ่อ" nav="ponds">
      <div className="chips">
        {chips.map(([k, l]) => (
          <Chip key={k} on={f === k} onClick={() => setParams(k === 'all' ? {} : { f: k }, { replace: true })}>
            {l}
          </Chip>
        ))}
      </div>
      <span className="l5 mut">เลขใหญ่ในช่อง คือ ตัวต่อกิโล</span>
      {zones.map((z) => {
        const list = ponds.filter((p) => p.zone === z.zone && inFilter(p, f))
        if (!list.length) return null
        return (
          <div className="zone" key={z.zone}>
            <div className="xzh">
              <b>
                โซน {z.zone}
                {z.caretaker ? ` · ${z.caretaker}` : ''}
              </b>
              <span>
                {z.photoToday === z.total ? 'ส่งครบ' : 'ส่งแล้ว'} {z.photoToday}/{z.total}
              </span>
            </div>
            <div className="xpg">
              {list.map((p) => (
                <button key={p.id} type="button" className={`xpd ${KIND[p.status]}`} onClick={() => navigate(P.pond(p.id))}>
                  <span className="id">{p.code}</span>
                  <span className="n">{p.perKg ?? '?'}</span>
                  <span className="st">{stateWord(p)}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
      {f !== 'all' && !count(f) ? <span className="l5 mut">ไม่มีบ่อในกลุ่มนี้ค่ะ</span> : null}
    </Page>
  )
}
