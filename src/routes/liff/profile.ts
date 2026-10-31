/**
 * The person's LINE name and picture, as LINE has them today.
 *
 * LINE hands both over with every verified token (src/middleware/liff-auth.ts).
 * GET /session, which every app open calls first, keeps them: the picture on
 * the person's `line_users` row (`picture_url`, line-bot migration 190) and
 * the name on their membership. People lists then read the pictures back.
 * Someone who has not opened the app since (a worker who joined before
 * pictures were kept, one who only scans from the chat) is asked of LINE by
 * the bot instead, when a people list needs them, and kept the same way.
 * Never fatal either way: a failed write or read is a letter in a circle
 * instead of a face, not an error on the screen.
 */

import type { Ctx } from '../../data/context.js'
import type { MemberRow, Repos } from '../../data/types.js'
import { botProfilePicture } from '../../lib/line/profile.js'
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

/** When LINE last had no picture for a person, so a people list asks again only after a while. */
const askedLine = new Map<string, number>()
const ASK_LINE_AGAIN_MS = 6 * 60 * 60 * 1000

/** Tests only. */
export function __resetProfileMemory(): void {
  written.clear()
  askedLine.clear()
}

/**
 * Each member's LINE picture, by LINE id. The kept ones first; anyone without
 * one is asked of LINE (at most every six hours a person) and kept when LINE
 * has it. Empty when the pictures cannot be read.
 */
export async function picturesOf(repos: Repos, members: MemberRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(members.map((m) => m.lineUserId))]
  let out: Map<string, string>
  try {
    out = await repos.people.pictures(ids)
  } catch (err) {
    logger.warn(`[liff] could not read LINE pictures: ${err instanceof Error ? err.message : String(err)}`)
    return new Map()
  }
  const now = Date.now()
  const ask = ids.filter((id) => !out.has(id) && now - (askedLine.get(id) ?? 0) >= ASK_LINE_AGAIN_MS)
  await Promise.all(
    ask.map(async (id) => {
      const picture = await botProfilePicture(id)
      if (!picture) {
        if (askedLine.size >= WRITTEN_MAX) askedLine.clear()
        askedLine.set(id, now)
        return
      }
      out.set(id, picture)
      try {
        await repos.people.setPicture(id, picture)
        if (written.size >= WRITTEN_MAX) written.clear()
        written.set(id, picture)
      } catch (err) {
        logger.warn(`[liff] could not keep a LINE picture: ${err instanceof Error ? err.message : String(err)}`)
      }
    }),
  )
  return out
}
