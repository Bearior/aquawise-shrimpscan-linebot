/**
 * The farm's settings (O25): GET /settings for anyone in the farm, PATCH
 * /settings ({ notify }) for an owner or manager. The switches are stored;
 * the morning push and the reminder that read them are not built yet.
 */

import { Router } from 'express'
import type { NotifySettings, SettingsResponse } from '../../contract/types.js'
import { ApiError, requireFarm } from '../../data/context.js'
import type { FarmSettings, Repos } from '../../data/types.js'
import { NOTIFY_DEFAULTS } from '../../domain/settings.js'
import { handle, type GetRepos } from './handle.js'
import { oneAtATime } from './lock.js'
import { noWorker } from './ponds.js'

async function view(repos: Repos, farmId: string, settings: FarmSettings): Promise<SettingsResponse> {
  const nets = await repos.nets.ofFarm(farmId)
  return { notify: settings.notify, nets: { count: nets.length, sizes: nets.map((n) => n.cm) } }
}

/** The switches the body names, each a boolean; anything else is 400 bad_request. */
export function parseNotify(body: unknown): Partial<NotifySettings> {
  const notify = (body as { notify?: unknown } | undefined)?.notify
  if (typeof notify !== 'object' || notify === null || Array.isArray(notify)) throw new ApiError(400, 'bad_request')
  const out: Partial<NotifySettings> = {}
  for (const [k, v] of Object.entries(notify)) {
    if (!(k in NOTIFY_DEFAULTS) || typeof v !== 'boolean') throw new ApiError(400, 'bad_request')
    out[k as keyof NotifySettings] = v
  }
  return out
}

export function settingsRouter(getRepos: GetRepos): Router {
  const r = Router()

  r.get(
    '/settings',
    handle(getRepos, async ({ repos, ctx }) => {
      const { farm } = requireFarm(ctx)
      return view(repos, farm.id, await repos.settings.read(farm.id))
    }),
  )

  r.patch(
    '/settings',
    handle(getRepos, async ({ req, repos, ctx }) => {
      const { farm, me } = requireFarm(ctx)
      noWorker(me)
      const patch = parseNotify(req.body)
      const saved = await oneAtATime(`settings:${farm.id}`, async () => {
        const settings = await repos.settings.read(farm.id)
        const next = { ...settings, notify: { ...settings.notify, ...patch } }
        await repos.settings.write(farm.id, next)
        return next
      })
      return view(repos, farm.id, saved)
    }),
  )

  return r
}
