import type { NextFunction, Request, Response } from 'express'
import { ApiError } from '../../data/context.js'
import { logger } from '../../lib/logger.js'

/** `ApiError` → its status and `{ error: code }`; anything else → 500, logged. */
export function sendApiError(res: Response, err: unknown): void {
  if (res.headersSent) return
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.code })
    return
  }
  logger.error('[liff] route failed', { error: err instanceof Error ? err.message : String(err) })
  res.status(500).json({ error: 'internal_error' })
}

/** express.json's own failures: a body that is not JSON is the client's, not ours. */
export function bodyErrors(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  const type = (err as { type?: string } | null)?.type
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: 'bad_request' })
    return
  }
  if (type === 'entity.too.large') {
    res.status(413).json({ error: 'too_large' })
    return
  }
  next(err)
}
