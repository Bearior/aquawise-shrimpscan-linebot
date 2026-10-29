/**
 * The `/api/liff/*` routes built on the shared database. One place lists them;
 * whatever is not listed falls through to app.ts's 501 not_built_yet.
 */

import express, { Router } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseRepos } from '../../data/supabase/index.js'
import type { Repos } from '../../data/types.js'
import { getDb } from '../../lib/db.js'
import { sizingService, type SizingClient } from '../../lib/sizing.js'
import { verifyLiffIdToken } from '../../middleware/liff-auth.js'
import { bodyErrors } from './errors.js'
import type { GetRepos } from './handle.js'
import { netsRouter } from './nets.js'
import { scansRouter } from './scans.js'
import { pondsRouter } from './ponds.js'
import { sessionRouter } from './session.js'

let cached: { db: SupabaseClient; repos: Repos } | null = null

function supabaseRepos(): Repos | null {
  const db = getDb()
  if (!db) return null
  if (cached?.db !== db) cached = { db, repos: createSupabaseRepos(db) }
  return cached.repos
}

export interface LiffRouterOptions {
  /** Replaces the database (tests). */
  repos?: Repos
  /** Replaces the sizing service (tests). */
  sizing?: SizingClient
}

export function liffRouter(opts: LiffRouterOptions = {}): Router {
  const injected = opts.repos
  const getRepos: GetRepos = injected ? () => injected : supabaseRepos
  const r = Router()
  r.use(verifyLiffIdToken, express.json({ limit: '64kb' }), bodyErrors)
  r.use(sessionRouter(getRepos))
  r.use(pondsRouter(getRepos))
  r.use(netsRouter(getRepos))
  r.use(scansRouter(getRepos, opts.sizing ?? sizingService))
  return r
}
