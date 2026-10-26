/**
 * Channel-target gate for any script that reads or changes a LINE channel with
 * a token (ported from line-bot `src/lib/rich-menu/safety.ts`).
 *
 * The access token alone gives no hint of which channel it belongs to, so the
 * operator must say so: line-bot once ran its staging database with the prod
 * LINE token (2026-05-31).
 *
 *   LINE_CHANNEL_TARGET=staging   allowed
 *   LINE_CHANNEL_TARGET=prod      needs --allow-prod for anything that changes the channel
 *   unset or anything else        refused
 */
export type ChannelTarget = 'staging' | 'prod'

export function requireSafeTarget(opts: { mutating: boolean; allowProd: boolean }): ChannelTarget {
  const target = process.env.LINE_CHANNEL_TARGET
  if (!target) {
    throw new Error(
      'LINE_CHANNEL_TARGET is required. Set it to "staging" or "prod" to match the owner of\n' +
        '  LINE_CHANNEL_ACCESS_TOKEN. The token alone does not say which channel it is for.',
    )
  }
  if (target !== 'staging' && target !== 'prod') {
    throw new Error(`LINE_CHANNEL_TARGET must be "staging" or "prod" (got "${target}").`)
  }
  if (target === 'prod' && opts.mutating && !opts.allowProd) {
    throw new Error('Refusing to change the PROD LINE channel without --allow-prod. Real farmers will see it.')
  }
  return target
}
