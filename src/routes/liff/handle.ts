import type { Request, RequestHandler, Response } from 'express'
import { ApiError, resolveContext, type Ctx } from '../../data/context.js'
import type { Repos } from '../../data/types.js'
import { sendApiError } from './errors.js'

/** The repositories, or null when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset. */
export type GetRepos = () => Repos | null

export interface RouteCtx {
  req: Request
  res: Response
  repos: Repos
  ctx: Ctx
}

/**
 * One part-1 route: the database or 503 db_not_configured, then who is asking
 * (`resolveContext`), then `fn`. What `fn` returns is sent as JSON; `undefined`
 * is a 204 unless `fn` answered itself. Errors go through `sendApiError`
 * (Express 4 does not catch a rejected promise).
 */
export function handle(getRepos: GetRepos, fn: (c: RouteCtx) => Promise<unknown>): RequestHandler {
  return async (req, res) => {
    try {
      const repos = getRepos()
      if (!repos) throw new ApiError(503, 'db_not_configured')
      const ctx = await resolveContext(repos, req.lineUserId!)
      const out = await fn({ req, res, repos, ctx })
      if (res.headersSent) return
      if (out === undefined) res.status(204).end()
      else res.json(out)
    } catch (err) {
      sendApiError(res, err)
    }
  }
}
