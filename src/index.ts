// Load a local .env in development only.
//
// `dotenv` is a devDependency, so it does not exist in the production image.
// The test is `K_SERVICE` (set by Cloud Run on every revision, absent locally),
// not NODE_ENV: staging runs NODE_ENV=staging, and in line-bot a NODE_ENV test
// made the staging container die at import before it could bind $PORT.
if (process.env.NODE_ENV !== 'production' && !process.env.K_SERVICE) {
  try {
    const dotenv = await import('dotenv')
    dotenv.config()
  } catch {
    // No local .env tooling: carry on with the ambient environment.
  }
}

// Refuse to boot a deployed revision that carries the dev-auth variables.
// Runs after dotenv so a local .env is honoured.
const { assertNoDevAuthInDeployedEnv } = await import('./middleware/liff-auth.js')
assertNoDevAuthInDeployedEnv()

const { createApp } = await import('./app.js')
const { logger } = await import('./lib/logger.js')
const { lineConfigured } = await import('./lib/line/client.js')
const { liffChannelAllowList } = await import('./middleware/liff-auth.js')

const PORT = Number(process.env.PORT || 3000)
const app = createApp()

app.listen(PORT, () => {
  logger.info(`Listening on ${PORT}`)
  // Missing LINE variables are a state, not a crash: say so once at boot.
  if (!lineConfigured()) logger.warn('LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN unset: /webhook answers 503')
  if (liffChannelAllowList().length === 0) logger.warn('LIFF_CHANNEL_ID unset: /api/liff/* answers 503')
  if (!process.env.LIFF_ID) logger.warn('LIFF_ID unset: /api/liff-config returns an empty liffId')
})
