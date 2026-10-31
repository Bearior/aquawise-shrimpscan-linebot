/**
 * `pnpm mock`: the Vite dev server answers `/api/*` itself, from the in-memory
 * farm in ./store.ts. No backend, no LINE, no database.
 *
 * - `/api/liff-config` has no LIFF id, so the app runs without the SDK and the
 *   dev token (`.env.mock`) stands in for the ID token.
 * - `/api/liff/*` wants `Authorization: Bearer dev-liff` like the real server's
 *   dev bypass, so a screen that forgets to wait for LIFF still 401s here.
 * - Who you are comes from `x-mock-persona` (`?as=owner|manager|worker|new|fresh`).
 * - `/mock-photos/:id` serves the fixtures in ./fixtures and photos uploaded
 *   in this run; `/mock-avatars/:id` draws a LINE picture for some people.
 *
 * State lives until the dev server restarts. `POST /api/mock/reset` starts over.
 * `/mock` is a page of links: every screen, for every persona.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { MockError, Store, photos, type Persona } from './store'
import type { MemberPondsPut, PondRename, PondsAdd, WatchAckPut, ZoneNamePut } from '../src/api/types'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PERSONAS: Persona[] = ['owner', 'manager', 'worker', 'new', 'fresh']
/** A model call takes a moment; the screens show their own progress meanwhile. */
const MEASURE_DELAY_MS = 600

type Req = IncomingMessage & { url?: string }
type Handler = (ctx: { persona: Persona; body: unknown; raw: Buffer; type: string; host: string; q: URLSearchParams }, ...params: string[]) => unknown

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status
  if (body === undefined) {
    res.end()
    return
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req: Req): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function routes(store: Store): [string, RegExp, Handler][] {
  const r = (method: string, pattern: string, h: Handler): [string, RegExp, Handler] => [
    method,
    new RegExp(`^${pattern.replace(/:[a-z]+/gi, '([^/]+)')}$`),
    h,
  ]
  const b = <T>(x: unknown) => x as T
  return [
    r('GET', '/session', ({ persona }) => store.session(persona)),
    r('POST', '/gate', ({ body }) => store.gate(String(b<{ code?: unknown }>(body)?.code ?? ''))),
    r('POST', '/start', ({ persona, body }) => store.start(persona, b(body))),
    r('PATCH', '/farm', ({ persona, body }) => store.setTarget(persona, b<{ targetPerKg: number }>(body).targetPerKg)),
    r('GET', '/me', ({ persona }) => store.me(persona)),

    r('GET', '/ponds', ({ persona }) => store.ponds(persona)),
    r('POST', '/ponds', ({ persona, body }) => store.addPonds(persona, b<PondsAdd>(body)?.codes ?? [])),
    r('PATCH', '/ponds/:id', ({ persona, body }, id) => store.renamePond(persona, id!, b<PondRename>(body)?.code ?? '')),
    r('PUT', '/zones/:zone', ({ persona, body }, zone) => store.setZoneName(persona, zone!, b<ZoneNamePut>(body)?.name ?? '')),
    r('GET', '/ponds/:id', ({ persona }, id) => store.pondDetail(persona, id!)),
    r('GET', '/ponds/:id/scans', ({ persona }, id) => store.pondScans(persona, id!)),
    r('GET', '/ponds/:id/stocking', ({ persona }, id) => store.stocking(persona, id!)),
    r('PUT', '/ponds/:id/stocking', ({ persona, body }, id) => store.saveStocking(persona, id!, b(body))),
    r('PUT', '/ponds/:id/net', ({ persona, body }, id) => store.setPondNet(persona, id!, b<{ netId: string }>(body).netId)),
    r('GET', '/overview', ({ persona }) => store.overview(persona)),
    r('PUT', '/watch/:key/ack', ({ persona, body }, key) => store.ackWatch(persona, key!, b<WatchAckPut>(body)?.signature ?? '')),
    r('DELETE', '/watch/:key/ack', ({ persona }, key) => store.unackWatch(persona, key!)),
    r('GET', '/today', ({ persona }) => store.today(persona)),
    r('GET', '/team/today', ({ persona }) => store.teamToday(persona)),

    r('GET', '/nets', ({ persona }) => store.nets(persona)),
    r('POST', '/nets', ({ persona, body }) => store.addNet(persona, b(body))),
    r('PATCH', '/nets/:id', ({ persona, body }, id) => store.editNet(persona, id!, b(body))),

    r('POST', '/scans', ({ persona, raw, type, q }) => store.upload(persona, q.get('pondId') ?? '', raw, type)),
    r('GET', '/scans/:id', ({ persona }, id) => store.getScan(persona, id!)),
    r('POST', '/scans/:id/measure', async ({ persona, body }, id) => {
      await sleep(MEASURE_DELAY_MS)
      const x = b<{ rim: { x: number; y: number }[]; netId: string }>(body)
      return store.measure(persona, id!, x.rim, x.netId)
    }),
    r('POST', '/scans/:id/net', async ({ persona, body }, id) => {
      await sleep(MEASURE_DELAY_MS)
      return store.changeNet(persona, id!, b<{ netId: string }>(body).netId)
    }),
    r('POST', '/scans/:id/save', ({ persona, body }, id) => store.save(persona, id!, b<{ notes?: string[] }>(body)?.notes)),
    r('POST', '/scans/:id/fix', async ({ persona, body }, id) => {
      await sleep(MEASURE_DELAY_MS)
      return store.fix(persona, id!, b<{ rim: { x: number; y: number }[] }>(body).rim)
    }),
    r('POST', '/scans/:id/fix/apply', ({ persona, body }, id) => {
      const x = b<{ use: 'new' | 'old'; rim: { x: number; y: number }[] }>(body)
      return store.fixApply(persona, id!, x.use, x.rim)
    }),

    r('GET', '/inbox', ({ persona }) => store.inbox(persona)),
    r('POST', '/inbox/:id/ask-again', ({ persona, body }, id) => store.askAgain(persona, id!, b<{ reason: never }>(body).reason)),

    r('GET', '/members', ({ persona, host }) => store.members(persona, host)),
    r('PATCH', '/members/:id', ({ persona, body }, id) => store.setRole(persona, id!, b<{ role: 'manager' | 'worker' }>(body).role)),
    r('DELETE', '/members/:id', ({ persona }, id) => store.removeMember(persona, id!)),
    r('GET', '/members/:id/ponds', ({ persona }, id) => store.memberPonds(persona, id!)),
    r('PUT', '/members/:id/ponds', ({ persona, body }, id) => store.setMemberPonds(persona, id!, b<MemberPondsPut>(body).pondIds ?? [])),
    r('GET', '/members/:id/permissions', ({ persona }, id) => store.permissions(persona, id!)),
    r('PATCH', '/members/:id/permissions', ({ persona, body }, id) => store.patchPermissions(persona, id!, b(body))),
    r('POST', '/invites', ({ persona, body, host }) => store.createInvite(persona, b(body), host)),
    r('DELETE', '/invites/:code', ({ persona }, code) => store.cancelInvite(persona, code!)),
    r('GET', '/invites/:code', ({ persona }, code) => store.invitePreview(persona, code!)),
    r('POST', '/invites/:code/accept', ({ persona, body }, code) => store.acceptInvite(persona, code!, b(body))),

    r('GET', '/settings', ({ persona }) => store.settings(persona)),
    r('PATCH', '/settings', ({ persona, body }) => store.saveNotify(persona, b<{ notify: object }>(body).notify ?? {})),

    r('GET', '/print/farm', ({ persona }) => store.farmSheet(persona)),
    r('GET', '/print/pond/:id', ({ persona }, id) => store.pondSheet(persona, id!)),
    r('POST', '/print/send', ({ persona, body }) => store.sendSheet(persona, b(body))),
  ]
}

/** [screen, path under /liff/app] by persona, for the `/mock` page. */
const HUB: [Persona, string, [string, string][]][] = [
  ['owner', 'เจ้าของ · พี่วิชัย', [
    ['ภาพรวม', '/overview'], ['รายบ่อ', '/ponds'], ['แก้ไขโซนและบ่อ', '/ponds/edit'], ['หน้าบ่อ A04', '/ponds/p-a04'],
    ['หน้าบ่อ F10 (ยังไม่สแกน)', '/ponds/p-f10'], ['ข้อมูลลงกุ้ง A04', '/ponds/p-a04/stocking'], ['ประวัติ F10', '/ponds/p-f10/history'],
    ['แก้ขอบยอ F10', '/scans/s-f10-1015/fix'], ['สแกนวันนี้', '/team'], ['บ่อที่ช่างเอกดูแล', '/people/m-ek/ponds?from=team'],
    ['สแกน', '/scan'], ['คนในฟาร์ม', '/people'], ['ชวนคนเข้าฟาร์ม', '/people/invite'], ['สิทธิ์ของลุงพล', '/people/m-phon/permissions'],
    ['สิทธิ์ของน้าศักดิ์', '/people/m-sak/permissions'], ['ตั้งค่า', '/settings'], ['ยอของฟาร์ม', '/nets'], ['พิมพ์', '/print'],
    ['ใบสรุปฟาร์ม', '/print/farm'], ['ใบบ่อ A04', '/print/pond/p-a04'],
  ]],
  ['manager', 'ผู้จัดการ · น้าศักดิ์ (โซน C และ D)', [
    ['ภาพรวม', '/overview'], ['รายบ่อ', '/ponds'], ['หน้าบ่อ C01', '/ponds/p-c01'], ['สแกนวันนี้', '/team'],
    ['บ่อของฉันวันนี้', '/today'], ['คนในฟาร์ม', '/people'], ['สแกน', '/scan'],
  ]],
  [
    'worker',
    'ลูกน้อง · ช่างเอก (โซน F)',
    [
      ['บ่อที่ต้องสแกนวันนี้', '/today'],
      ['สแกน F10', '/scan?pond=p-f10'],
      ['สแกน', '/scan'],
      ['บ่อที่ดูแล', '/ponds'],
      ['หน้าบ่อ F01', '/ponds/p-f01'],
      ['ประวัติสแกน F01', '/ponds/p-f01/history'],
    ],
  ],
  ['new', 'คนใหม่ที่มีฟาร์มในน้องน้ำ', [['เริ่มใช้', '/start'], ['รับคำเชิญ 7K2P9QX', '/join?invite=7K2P9QX']]],
  ['fresh', 'คนใหม่ ยังไม่มีฟาร์ม', [['รหัสเข้าร่วม แล้วสร้างฟาร์ม', '/start']]],
]

/** Every screen for every persona, as links; each opens in its own tab, which keeps its persona. */
function serveHub(res: ServerResponse): void {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const href = (as: Persona, path: string) => `/liff/app${path}${path.includes('?') ? '&' : '?'}as=${as}`
  const groups = HUB.map(
    ([as, who, pages]) =>
      `<section><h2>${esc(who)}</h2><ul>${pages.map(([label, path]) => `<li><a href="${href(as, path)}" target="_blank" rel="noopener">${esc(label)}</a></li>`).join('')}</ul></section>`,
  ).join('')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shrimp Scan mock</title>
<style>body{font:16px/1.5 system-ui,'Noto Sans Thai',sans-serif;margin:0 auto;max-width:960px;padding:16px;color:#0d0c18;background:#f6f6fb}
h1{font-size:22px;margin:4px 0}p{color:#4f4e62;margin:0 0 12px}section{background:#fff;border:1px solid #e0e0ea;border-radius:14px;padding:12px 16px;margin:12px 0}
h2{font-size:17px;margin:0 0 6px}ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px 16px;margin:0;padding:0;list-style:none}
a{color:#004aad;text-decoration:none;display:block;padding:6px 0}a:hover{text-decoration:underline}button{font:inherit;padding:8px 14px;border-radius:10px;border:1px solid #004aad;background:#fff;color:#004aad;cursor:pointer}</style></head>
<body><h1>Shrimp Scan · mock ทุกบทบาท ทุกหน้า</h1><p>ทุกลิงก์เปิดแท็บใหม่ และจำบทบาทไว้ในแท็บนั้น ข้อมูลใช้ร่วมกันทุกแท็บ เปิดดูบนจอแคบ (390 px) จะเหมือนในมือถือที่สุด</p>
<button id="reset">เริ่มข้อมูลใหม่</button> <span id="done"></span>${groups}
<script>document.getElementById('reset').onclick=async()=>{await fetch('/api/mock/reset',{method:'POST'});document.getElementById('done').textContent='เริ่มใหม่แล้ว'}</script></body></html>`)
}

/** A LINE picture stand-in: head and shoulders on a colour of the person's own. */
function serveAvatar(res: ServerResponse, id: string): void {
  const hues = [205, 150, 25, 280, 340]
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const hue = hues[h % hues.length]!
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="hsl(${hue} 45% 78%)"/><circle cx="48" cy="38" r="17" fill="hsl(${hue} 30% 38%)"/><path d="M14 96c2-20 16-31 34-31s32 11 34 31z" fill="hsl(${hue} 30% 38%)"/></svg>`
  res.setHeader('Content-Type', 'image/svg+xml')
  res.setHeader('Cache-Control', 'max-age=3600')
  res.end(svg)
}

function servePhoto(res: ServerResponse, name: string): void {
  const uploaded = photos.get(name)
  if (uploaded) {
    res.setHeader('Content-Type', uploaded.type)
    res.end(uploaded.bytes)
    return
  }
  if (!/^[a-z-]+$/.test(name)) return send(res, 404, { error: 'not_found' })
  try {
    const bytes = readFileSync(path.join(HERE, 'fixtures', `${name}.jpg`))
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'max-age=3600')
    res.end(bytes)
  } catch {
    send(res, 404, { error: 'not_found' })
  }
}

export function mockApiPlugin(): Plugin {
  let store = new Store()
  let table = routes(store)

  return {
    name: 'aw-mock-api',
    configureServer(server) {
      server.middlewares.use(async (req: Req, res: ServerResponse, next: () => void) => {
        const url = new URL(req.url ?? '/', 'http://mock.local')
        const p = url.pathname

        if (p.startsWith('/mock-photos/')) return servePhoto(res, decodeURIComponent(p.slice('/mock-photos/'.length)))
        if (p.startsWith('/mock-avatars/')) return serveAvatar(res, decodeURIComponent(p.slice('/mock-avatars/'.length)))
        if (p === '/mock' || p === '/mock/') return serveHub(res)
        if (!p.startsWith('/api/')) return next()

        if (p === '/api/liff-config') return send(res, 200, { env: 'mock' })
        if (p === '/api/mock/reset' && req.method === 'POST') {
          store = new Store()
          table = routes(store)
          return send(res, 204)
        }
        if (!p.startsWith('/api/liff/')) return send(res, 404, { error: 'not_found' })

        if (req.headers.authorization !== 'Bearer dev-liff') return send(res, 401, { error: 'unauthorized' })
        const asked = String(req.headers['x-mock-persona'] ?? 'owner')
        const persona = (PERSONAS as string[]).includes(asked) ? (asked as Persona) : 'owner'

        const sub = p.slice('/api/liff'.length)
        const hit = table.find(([m, re]) => m === req.method && re.test(sub))
        if (!hit) return send(res, 404, { error: 'not_found' })

        try {
          const raw = await readBody(req)
          const type = String(req.headers['content-type'] ?? '')
          const body = type.startsWith('application/json') && raw.length ? (JSON.parse(raw.toString('utf8')) as unknown) : undefined
          const params = (hit[1].exec(sub) ?? []).slice(1).map((x) => decodeURIComponent(x))
          const host = `http://${req.headers.host ?? 'localhost:5199'}`
          const out = await hit[2]({ persona, body, raw, type, host, q: url.searchParams }, ...params)
          send(res, out === undefined ? 204 : 200, out)
        } catch (e) {
          if (e instanceof MockError) return send(res, e.status, { error: e.message })
          server.config.logger.error(`[mock] ${req.method} ${p}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`)
          send(res, 500, { error: 'mock_failed' })
        }
      })
    },
  }
}
