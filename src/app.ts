import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import type { webhook } from '@line/bot-sdk'
import { BUILD_ID } from './lib/build-id.js'
import { validateLineSignature } from './lib/line/client.js'
import { logger } from './lib/logger.js'
import { handleWebhookEvents } from './handlers/webhook.js'
import { verifyLiffIdToken } from './middleware/liff-auth.js'
import { envName, liffMeRouter } from './routes/liff-me.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface AppOptions {
  /** Where the built LIFF lives. Defaults to `<repo>/public/liff`. */
  liffDir?: string
  /** Replaces the event handler (tests). */
  onEvents?: (events: webhook.Event[]) => Promise<void>
}

export function createApp(opts: AppOptions = {}): express.Express {
  const app = express()
  const onEvents = opts.onEvents ?? ((events) => handleWebhookEvents(events))

  app.disable('x-powered-by')
  // CSP off: this process serves the LIFF SPA, whose LINE SDK origins would
  // need a hand-tuned policy. An over-broad CSP is worse than none here.
  app.use(helmet({ contentSecurityPolicy: false }))
  app.set('trust proxy', 1)

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'aquawise-shrimpscan-line-bot', build_id: BUILD_ID })
  })

  // LINE webhook. The signature is checked on the RAW body before any JSON
  // parse; 200 goes back at once (LINE wants it within a second) and the
  // events are handled after.
  const webhookLimit = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false })
  app.post(
    '/webhook',
    webhookLimit,
    // 512kb bounds a memory DoS on the public webhook.
    express.raw({ type: 'application/json', limit: '512kb' }),
    (req: Request, res: Response, next: NextFunction) => {
      try {
        // Boots without LINE secrets on purpose: the first deploy comes before
        // the channel exists. Answer 503, never crash.
        if (!process.env.LINE_CHANNEL_SECRET) {
          res.status(503).json({ error: 'line_not_configured' })
          return
        }
        const signature = req.headers['x-line-signature']
        if (typeof signature !== 'string' || !signature) {
          res.status(400).json({ error: 'Missing signature' })
          return
        }
        const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('')
        if (!validateLineSignature(raw, signature)) {
          logger.warn('Invalid webhook signature')
          res.status(403).json({ error: 'Invalid signature' })
          return
        }
        let events: webhook.Event[] = []
        try {
          events = (JSON.parse(raw.toString('utf-8')) as { events?: webhook.Event[] }).events ?? []
        } catch {
          res.status(400).json({ error: 'Invalid JSON' })
          return
        }
        res.status(200).json({ success: true })
        if (events.length > 0) {
          if (!process.env.LINE_CHANNEL_ACCESS_TOKEN && !opts.onEvents) {
            logger.warn('LINE_CHANNEL_ACCESS_TOKEN unset, events received but not answered', { count: events.length })
            return
          }
          onEvents(events).catch((error) => logger.error('Error processing events', { error: String(error) }))
        }
      } catch (error) {
        next(error)
      }
    },
  )

  // LIFF static app.
  //
  // DO NOT set Cache-Control `no-store` or `no-cache` on the /liff document.
  // In line-bot both put the LINE webview into an endless login/reload loop
  // (commit cf04808, reverted). Staleness is handled on the client instead:
  // the inline build-id check in index.html plus lib/liff/build-version.ts.
  //
  // `redirect: false` + the explicit handler: LINE opens `/liff?...` with no
  // trailing slash, and express.static would answer that with a 301, an extra
  // round trip on every open.
  //
  // `/liff/assets` holds only content-hashed Vite output, so it can be cached
  // immutable: a changed file gets a new name.
  const liffDir = opts.liffDir ?? path.join(__dirname, '..', 'public', 'liff')
  app.use('/liff/assets', express.static(path.join(liffDir, 'assets'), { maxAge: '1y', immutable: true, redirect: false }))
  app.use('/liff', express.static(liffDir, { redirect: false, index: false }))
  app.get(['/liff', '/liff/*'], (_req: Request, res: Response) => {
    res.sendFile(path.join(liffDir, 'index.html'), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'liff_not_built' })
    })
  })

  // LIFF runtime config. LIFF_ID is not a secret (it is in every LIFF URL).
  // no-store: `build_id` is the freshness signal the stale-bundle check reads;
  // a cached copy would match a cached bundle and never self-heal. (This is an
  // API response; the "never no-store" rule above is about the HTML.)
  app.get('/api/liff-config', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store')
    res.json({ liffId: process.env.LIFF_ID?.trim() || '', build_id: BUILD_ID, env: envName() })
  })

  app.use('/api/liff', liffMeRouter)
  // Every other /api/liff route the LIFF screens call is not built on the
  // server yet (the mock API in liff-app/dev-mock serves them). Auth still
  // runs first, so an unconfigured or unauthenticated call fails the same way
  // a real one would.
  app.use('/api/liff', verifyLiffIdToken, (_req: Request, res: Response) => {
    res.status(501).json({ error: 'not_built_yet' })
  })

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', { error: String(err) })
    if (!res.headersSent) res.status(500).json({ error: 'internal_error' })
  })

  return app
}
