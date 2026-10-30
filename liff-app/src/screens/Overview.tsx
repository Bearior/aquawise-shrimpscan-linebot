import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { Overview as OverviewData, QueueRow } from '@/api/types'
import { Page } from '@/components/Page'
import { Icon } from '@/components/Icon'
import { WatchList } from '@/components/WatchList'
import { HomeBand } from '@/components/band'
import { Chip, ErrorState, InlineError, MBtn, Skeleton } from '@/components/ui'
import { QueueChart } from '@/components/charts'
import { zoneLabel } from '@/lib/farm-layout'
import { fmt1, fmtQueueDay, fmtTonnes, fmtWeekday } from '@/lib/format'
import { useApi } from '@/lib/use-api'
import { P } from '@/routes'
import { useSession } from '@/session'

const TARGETS = [30, 35, 40, 45, 50]

function QRow({ r, today, onOpen }: { r: QueueRow; today: string; onOpen: () => void }) {
  const d = fmtQueueDay(r.date, today)
  return (
    <button type="button" className="xq" onClick={onOpen}>
      <span className="tp">
        <span className={`d${d === 'วันนี้' ? ' today' : ''}`}>{d}</span>
        <span className="p">{r.pondCode}</span>
        <span className="t">{fmtTonnes(r.tonnes)} ตัน</span>
      </span>
      <span className="s">
        {r.perKg} ตัว/กก. · {fmt1(r.abw)} ก.
      </span>
    </button>
  )
}

/**
 * Under สแกนวันนี้'s bar: one short row a zone (its name, a thin bar, done of
 * total) instead of every pond name left (Bear, 2026-10-31: the red list
 * "ยังไม่สแกน A01 A02 …" grew with the farm and showed every morning). A farm
 * of one zone gets the count alone. Nothing here is red: a morning half done
 * is the normal morning, and ต้องดู above already counts the ponds missed.
 */
function ScanZones({ day }: { day: OverviewData['photosToday'] }) {
  const left = day.total - day.sent
  if (!left) {
    return (
      <span className="ov-all">
        <Icon n="check" />
        สแกนครบทุกบ่อแล้วค่ะ
      </span>
    )
  }
  return (
    <>
      {day.zones.length > 1 ? (
        <ul className="ov-zs" aria-label="สแกนวันนี้ทีละโซน">
          {day.zones.map((z) => {
            const done = z.done === z.total
            return (
              <li key={z.zone} className={done ? 'ok' : undefined}>
                <span className="zl mono" aria-hidden="true">
                  {z.zone}
                </span>
                <span className="zn">{zoneLabel(z.zone, z.name)}</span>
                <span className="zb" aria-hidden="true">
                  <i style={{ width: `${z.total ? Math.round((z.done / z.total) * 100) : 0}%` }} />
                </span>
                {done ? (
                  <span className="zc ok" aria-label={`ครบ ${z.total} บ่อ`}>
                    <Icon n="check" />
                  </span>
                ) : (
                  <b className="zc mono">
                    {z.done}/{z.total}
                  </b>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
      <span className="ov-left">
        ยังไม่สแกน <b className="mono">{left}</b> บ่อ
        {day.remindAt ? ` · ${day.remindAt} น้ำจะเตือนให้ค่ะ` : ''}
      </span>
    </>
  )
}

/** ภาพรวมฟาร์ม (O21): เรื่องน่าจับตา, the four groups, photos sent, the 14-day harvest queue. */
export default function Overview() {
  const navigate = useNavigate()
  const { session, setSession } = useSession()
  const o = useApi(() => api.overview())
  const [targetErr, setTargetErr] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const canPrint = session.permissions.printSheet

  const band = (
    <HomeBand
      farmName={session.farm!.name}
      sub={`${fmtWeekday(session.today)} · ${session.farm!.pondCount} บ่อ`}
      userName={session.user.name}
      onProfile={() => navigate(P.settings)}
    />
  )

  if (!o.data) {
    return (
      <Page top={null} nav="overview">
        {band}
        {o.error ? <ErrorState error={o.error} onRetry={o.reload} /> : <Skeleton rows={[180, 230, 80, 320]} />}
      </Page>
    )
  }
  const d: OverviewData = o.data

  const setTarget = async (n: number) => {
    if (n === d.targetPerKg || saving) return
    setSaving(true)
    setTargetErr(null)
    try {
      setSession(await api.setTarget(n))
      o.reload()
    } catch (e) {
      setTargetErr(e)
    } finally {
      setSaving(false)
    }
  }

  const sentPct = d.photosToday.total ? (d.photosToday.sent / d.photosToday.total) * 100 : 0
  const tile = (k: string, label: ReactNode, n: number, s: string, f: string) => (
    <button type="button" className={`tile xtile ${k}`} onClick={() => navigate(`${P.ponds}?f=${f}`)}>
      <span className="tl">{label}</span>
      <span className="tn">{n}</span>
      <span className="ts2">{s}</span>
    </button>
  )

  return (
    <Page top={null} nav="overview">
      {band}
      <WatchList items={d.watch} />

      <div className="xtiles">
        {tile(
          'r',
          <>
            พร้อมจับ
            <br />
            ใน 5 วัน
          </>,
          d.tiles.ready.n,
          `ราว ${fmtTonnes(d.tiles.ready.tonnes)} ตัน`,
          'ready',
        )}
        {tile('g', 'โตดี', d.tiles.good.n, 'ไซส์เสมอ', 'good')}
        {tile('w', 'เฝ้าระวัง', d.tiles.watch.n, 'ไซส์เริ่มไม่เสมอ', 'watch')}
        {tile('u', 'ต้องดู', d.tiles.urgent.n, `โตช้า ${d.tiles.urgent.slow} · ไม่ได้สแกน ${d.tiles.urgent.missing}`, 'urgent')}
      </div>

      <div className="vc xprog">
        <div className="pl">
          <span>สแกนวันนี้</span>
          <b>
            {d.photosToday.sent}/{d.photosToday.total}
          </b>
        </div>
        <div className="pt">
          <i style={{ width: `${sentPct.toFixed(1)}%` }} />
        </div>
        <ScanZones day={d.photosToday} />
        <MBtn icon="users" onClick={() => navigate(P.team)}>
          ดูว่าใครสแกนแล้ว
        </MBtn>
      </div>

      <div className="vc">
        <b className="l3">คิวจับ 14 วัน</b>
        <span className="l5 mut">แท่งสูง คือจำนวนบ่อที่ถึงไซส์ {d.targetPerKg} ในวันนั้น</span>
        <QueueChart days={d.queueDays} targetPerKg={d.targetPerKg} />
        <div className="qgh">
          <span>ภายใน 5 วัน · {d.soon.rows.length} บ่อ</span>
          <span>ราว {fmtTonnes(d.soon.tonnes)} ตัน</span>
        </div>
        <div className="lst">
          {d.soon.rows.length ? (
            d.soon.rows.map((r) => <QRow key={r.pondId} r={r} today={d.today} onOpen={() => navigate(P.pond(r.pondId))} />)
          ) : (
            <span className="l5 mut">ยังไม่มีบ่อถึงไซส์ใน 5 วันนี้ค่ะ</span>
          )}
        </div>
        <div className="qgh n">
          <span>อีก 6 ถึง 14 วัน · {d.later.rows.length} บ่อ</span>
          <span>ราว {fmtTonnes(d.later.tonnes)} ตัน</span>
        </div>
        <div className="lst">
          {d.later.rows.map((r) => (
            <QRow key={r.pondId} r={r} today={d.today} onOpen={() => navigate(P.pond(r.pondId))} />
          ))}
        </div>
        {d.beyond.map((b) => (
          <button key={b.from} type="button" className="qmore" onClick={() => navigate(P.ponds)}>
            <span>
              <b>{b.to ? `อีก ${b.from} ถึง ${b.to} วัน` : `${b.from} วันขึ้นไป`}</b> · {b.ponds} บ่อ
            </span>
            <span>
              ราว {fmtTonnes(b.tonnes)} ตัน
              <Icon n="chev" />
            </span>
          </button>
        ))}
        {canPrint ? (
          <MBtn icon="print" onClick={() => navigate(P.print)}>
            พิมพ์ใบสรุป
          </MBtn>
        ) : null}
      </div>

      <div className="grp">
        <b className="l3">จับขายที่ไซส์ (ตัว/กก.)</b>
        <div className="chips">
          {TARGETS.map((n) => (
            <Chip key={n} on={n === d.targetPerKg} onClick={() => void setTarget(n)} disabled={saving || session.role !== 'owner'}>
              {n}
            </Chip>
          ))}
        </div>
        <span className="l5 mut">เปลี่ยนแล้วทุกตัวเลขในแอปคิดใหม่</span>
        <InlineError error={targetErr} />
      </div>
    </Page>
  )
}
