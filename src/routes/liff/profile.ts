/**
 * The person's LINE name and picture, as LINE has them today.
 *
 * LINE hands both over with every verified token (src/middleware/liff-auth.ts).
 * GET /session, which every app open calls first, keeps them: the picture on
 * the person's `line_users` row (`picture_url`, line-bot migration 190) and
 * the name on their membership. People lists then read the pictures back.
 * Never fatal either way: a failed write or read is a letter in a circle
 * instead of a face, not an error on the screen.
 */

import type { Ctx } from '../../data/context.js'
import type { MemberRow, Repos } from '../../data/types.js'
import { logger } from '../../lib/logger.js'

/** The picture last written per person, so opening the app again writes nothing. One process (Railway runs one). */
const written = new Map<string, string>()
const WRITTEN_MAX = 5000

export async function refreshProfile(repos: Repos, ctx: Ctx, name: string | undefined, pictureUrl: string | undefined): Promise<void> {
  if (ctx.blocked || !ctx.farm || !ctx.me) return
  try {
    if (pictureUrl && written.get(ctx.lineUserId) !== pictureUrl) {
      await repos.people.setPicture(ctx.lineUserId, pictureUrl)
      if (written.size >= WRITTEN_MAX) written.clear()
      written.set(ctx.lineUserId, pictureUrl)
    }
    if (name && name !== ctx.me.name) {
      await repos.members.setName(ctx.me.id, name)
      ctx.me.name = name
    }
  } catch (err) {
    logger.warn(`[liff] could not keep the LINE profile: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Each member's LINE picture, by LINE id; empty when they cannot be read. */
export async function picturesOf(repos: Repos, members: MemberRow[]): Promise<Map<string, string>> {
  try {
    return await repos.people.pictures([...new Set(members.map((m) => m.lineUserId))])
  } catch (err) {
    logger.warn(`[liff] could not read LINE pictures: ${err instanceof Error ? err.message : String(err)}`)
    return new Map()
  }
}
