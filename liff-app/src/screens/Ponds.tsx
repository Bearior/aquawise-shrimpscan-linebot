import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { PondTile, ZoneSummary } from '@/api/types'
import { Page, Sheet } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { Ava } from '@/components/avatar'
import { Band } from '@/components/band'
import { ErrorState, Skeleton } from '@/components/ui'
import { zoneLabel } from '@/lib/farm-layout'
import { fmt1 } from '@/lib/format'
import { KIND, STATUS_PILL, progressTo, tileWord } from '@/lib/pond-words'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession } from '@/session'

type Filter = 'all' | 'ready' | 'good' | 'watch' | 'urgent'

/** In a filter, 'urgent' covers the ponds with no scan today too (the overview's ต้องดู tile counts both). */
function inFilter(p: PondTile, f: Filter): boolean {
  if (f === 'all') return true
  if (f === 'urgent') return p.status === 'urgent' || p.status === 'missing'
  return p.status === f
}

/** The four groups: the stacked bar's segments and the filter cells under it. */
const GROUPS: [Exclude<Filter, 'all'>, string, string][] = [
  ['ready', 'r', 'พร้อมจับ'],
  ['good', 'g', 'กำลังโต'],
  ['watch', 'w', 'เฝ้าระวัง'],
  ['urgent', 'u', 'ต้องดู'],
]

function ZoneHead({ z }: { z: ZoneSummary }) {
  const ok = z.total > 0 && z.photoToday === z.total
  return (
    <div className="pa-zh">
      {z.caretaker ? <Ava name={z.caretaker} /> : <span className="ava zl" aria-hidden="true">{z.zone}</span>}
      <b className="pa-zt">
        {zoneLabel(z.zone, z.name)}
        {z.caretaker ? <span> · {z.caretaker}</span> : null}
      </b>
      {ok ? (
        <span className="pa-zs ok">
          <span className="pa-ck">
            <Icon n="check" />
          </span>
          สแกนครบ <span className="mono">{z.photoToday}/{z.total}</span>
        </span>
      ) : (
        <span className="pa-zs wn">
          <Icon n="warn" />
          สแกนแล้ว <span className="mono">{z.photoToday}/{z.total}</span>
        </span>
      )}
    </div>
  )
}

/** One pond's summary, up from the bottom: the number, the state, and the way into หน้าบ่อ. */
function PondSheet({ p, zoneName, target, onOpen, onCancel }: { p: PondTile; zoneName: string | null; target: number; onOpen: () => void; onCancel: () => void }) {
  const [tone, label] = STATUS_PILL[p.status]
  const reach = p.daysToTarget === null ? 'ยังไม่รู้' : p.daysToTarget <= 0 ? 'จับได้วันนี้' : `อีก ${p.daysToTarget} วัน`
  return (
    <Sheet onCancel={onCancel} label={`บ่อ ${p.code}`} className="ps">
      <div className="ps-h">
        <div>
          <b>บ่อ {p.code}</b>
          <span>
            {zoneLabel(p.zone, zoneName)}
            {p.caretaker ? ` · ${p.caretaker}ดูแล` : ''}
          </span>
        </div>
        <button type="button" className="ps-x" onClick={onCancel} aria-label="ปิด">
          <Icon n="x" />
        </button>
      </div>
      <div className="ps-big">
        <b className="mono">{p.perKg ?? '-'}</b>
        <span>ตัวต่อกิโล{p.status === 'missing' && p.perKg !== null ? ' (ครั้งก่อน)' : ''}</span>
        <span className={`pill ${tone}`}>{label}</span>
      </div>
      <div className="ps-g">
        <div>
          <span>ตัวละ</span>
          <b>{p.abw !== null ? <><span className="mono">{fmt1(p.abw)}</span> ก.</> : 'ยังไม่รู้'}</b>
        </div>
        <div>
          <span>โตวันละ</span>
          <b>{p.gPerDay !== null ? <><span className="mono">{p.gPerDay.toFixed(2)}</span> ก.</> : 'ยังไม่รู้'}</b>
        </div>
        <div>
          <span>ถึงไซส์ {target} ตัว</span>
          <b>{reach}</b>
        </div>
        <div>
          <span>สแกนวันนี้</span>
          <b className={p.photoToday ? undefined : 'bad'}>{p.photoToday ? 'แล้ว' : 'ยังไม่สแกน'}</b>
        </div>
      </div>
      {p.issue && (p.status === 'urgent' || p.status === 'watch') ? (
        <p className={`ps-why ${p.status === 'urgent' ? 'bd' : 'wn'}`}>
          <Icon n="warn" />
          <span>{p.issue}</span>
        </p>
      ) : null}
      <button type="button" className="ps-go" onClick={onOpen}>
        เปิดหน้าบ่อ
      </button>
    </Sheet>
  )
}

/**
 * รายบ่อ (O22), แบบ A of the รายบ่อ redesign (docs/shrimpscan-ponds-team-redesign):
 * the whole farm in one stacked bar, the four counts under it doubling as the
 * filters, then every pond by zone, three to a row. A tile says the number
 * (ตัวต่อกิโล), why it is yellow or red, and a thin line for how close it is
 * to the farm's size. A tap opens the pond's summary from the bottom.
 */
export default function Ponds() {
  const navigate = useNavigate()
  const { session } = useSession()
  const [params, setParams] = useSearchParams()
  const f = (params.get('f') as Filter | null) ?? 'all'
  const r = useApi(() => api.ponds())
  const [open, setOpen] = useState<PondTile | null>(null)
  const target = session.farm!.targetPerKg
  // A worker reads the ponds they look after here (seePonds), with no ตั้งค่า behind their picture.
  const worker = session.role === 'worker'
  const band = (
    <Band
      art="pond"
      title={worker ? 'บ่อที่ดูแล' : 'รายบ่อ'}
      sub={worker ? `${session.user.name} · ${session.pondIds.length} บ่อ` : `${session.farm!.name} · ${session.farm!.pondCount} บ่อ`}
      userName={session.user.name}
      onProfile={worker ? undefined : () => navigate(P.settings)}
    />
  )

  if (!r.data) {
    return (
      <Page top={null} nav="ponds">
        {band}
        {r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : <Skeleton rows={[170, 260, 260]} />}
      </Page>
    )
  }
  const { ponds, zones } = r.data
  const count = (x: Filter) => ponds.filter((p) => inFilter(p, x)).length
  const setF = (x: Filter) => setParams(x === 'all' ? {} : { f: x }, { replace: true })
  const cur = GROUPS.find((g) => g[0] === f)
  // The bar counts each pond once; a pond with no scan today sits in ต้องดู like on the overview.
  const segs = GROUPS.map(([k, c, l]) => ({ k, c, l, n: count(k) }))

  return (
    <Page
      top={null}
      nav="ponds"
      over={
        open ? (
          <PondSheet
            p={open}
            zoneName={zones.find((z) => z.zone === open.zone)?.name ?? null}
            target={target}
            onCancel={() => setOpen(null)}
            onOpen={() => navigate(P.pond(open.id))}
          />
        ) : null
      }
    >
      {band}
      {session.role === 'owner' ? (
        <button type="button" className="pa-edit" onClick={() => navigate(P.pondsEdit)}>
          <span className="ic">
            <Icon n="edit" />
          </span>
          <span className="tx">
            <b>แก้ไขโซนและบ่อ</b>
            <span>ตั้งชื่อ · เพิ่มบ่อ · เพิ่มโซน</span>
          </span>
          <Icon n="chev" />
        </button>
      ) : null}
      <div className="pa-sum">
        <div className="pa-top">
          <div className="pa-n">
            <b className="mono">{ponds.length}</b>
            <span>บ่อ</span>
          </div>
          <div className="pa-bar" role="img" aria-label={segs.map((s) => `${s.l} ${s.n}`).join(' ')}>
            {segs.map((s) => (s.n ? <i key={s.k} className={`k-${s.c}`} style={{ flex: s.n }} /> : null))}
          </div>
        </div>
        <div className="pa-leg" role="group" aria-label="แตะกลุ่มเพื่อดูเฉพาะบ่อกลุ่มนั้น">
          {segs.map((s) => (
            <button key={s.k} type="button" aria-pressed={f === s.k} onClick={() => setF(f === s.k ? 'all' : s.k)}>
              <b className="mono">
                <i className={`k-${s.c}`} />
                {s.n}
              </b>
              <span>{s.l}</span>
            </button>
          ))}
        </div>
        <p className="pa-key">
          แตะกลุ่มเพื่อดูเฉพาะบ่อกลุ่มนั้น · เลขใหญ่ในช่อง คือ กุ้งกี่ตัวต่อกิโล · เส้นใต้ช่อง คือ ใกล้ไซส์จับ <b className="mono">{target}</b> ตัวแค่ไหน
        </p>
      </div>
      {cur ? (
        <div className="pa-fbar w-fade">
          <span>
            ดูเฉพาะ {cur[2]} {count(f)} บ่อ
          </span>
          <button type="button" onClick={() => setF('all')}>
            <Icon n="x" />
            ดูทั้งหมด
          </button>
        </div>
      ) : null}
      {zones.map((z) => {
        const list = ponds.filter((p) => p.zone === z.zone && inFilter(p, f))
        if (!list.length) return null
        return (
          <section className="pa-zone" key={z.zone}>
            <ZoneHead z={z} />
            <div className="pa-grid">
              {list.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`pa-t ${KIND[p.status]}${p.perKg === null ? ' z' : ''}`}
                  onClick={() => setOpen(p)}
                  aria-label={`บ่อ ${p.code} ${p.perKg !== null ? `${p.perKg} ตัวต่อกิโล ` : ''}${tileWord(p)}`}
                >
                  <span className="c">{p.code}</span>
                  <span className="n mono">{p.perKg ?? '-'}</span>
                  <span className="w">
                    {p.status === 'missing' ? <Icon n="cam" /> : null}
                    {tileWord(p)}
                  </span>
                  {p.perKg !== null ? (
                    <span className="pb">
                      <i style={{ width: `${Math.round(progressTo(p, target) * 100)}%` }} />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </section>
        )
      })}
      {f !== 'all' && !count(f) ? <p className="pa-empty">ไม่มีบ่อในกลุ่มนี้ค่ะ</p> : null}
    </Page>
  )
}
