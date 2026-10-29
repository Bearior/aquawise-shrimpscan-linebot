/**
 * `pnpm mock`: the Vite dev server answers `/api/*` itself, from the in-memory
 * farm in ./store.ts. No backend, no LINE, no database.
 *
 * - `/api/liff-config` has no LIFF id, so the app runs without the SDK and the
 *   dev token (`.env.mock`) stands in for the ID token.
 * - `/api/liff/*` wants `Authorization: Bearer dev-liff` like the real server's
 *   dev bypass, so a screen that forgets to wait for LIFF still 401s here.
 * - Who you are comes from `x-mock-persona` (`?as=owner|worker|new|fresh`).
 * - `/mock-photos/:id` serves the fixtures in ./fixtures and photos uploaded
 *   in this run.
 *
 * State lives until the dev server restarts. `POST /api/mock/reset` starts over.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { MockError, Store, photos, type Persona } from './store'
import type { MemberPondsPut, WatchAckPut } from '../src/api/types'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PERSONAS: Persona[] = ['owner', 'worker', 'new', 'fresh']
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
    r('POST', '/start', ({ persona, body }) => store.start(persona, b(body))),
    r('PATCH', '/farm', ({ persona, body }) => store.setTarget(persona, b<{ targetPerKg: number }>(body).targetPerKg)),
    r('GET', '/me', ({ persona }) => store.me(persona)),

    r('GET', '/ponds', ({ persona }) => store.ponds(persona)),
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
