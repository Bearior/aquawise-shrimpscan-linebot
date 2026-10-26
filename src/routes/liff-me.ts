import crypto from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { verifyLiffIdToken } from '../middleware/liff-auth.js'

/** 'staging' | 'production' | 'development', from NODE_ENV. */
export function envName(): string {
  const env = process.env.NODE_ENV
  if (env === 'production' || env === 'staging') return env
  return 'development'
}

/** First 12 hex characters of sha256(lineUserId): proves who is signed in
 * without ever sending the LINE user id itself. */
export function userTag(lineUserId: string): string {
  return crypto.createHash('sha256').update(lineUserId).digest('hex').slice(0, 12)
}

export const liffMeRouter = Router()

liffMeRouter.get('/me', verifyLiffIdToken, (req: Request, res: Response) => {
  res.json({ ok: true, env: envName(), user: userTag(req.lineUserId!) })
})
