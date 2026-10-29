/**
 * Is this process running on a deployed host? Cloud Run sets `K_SERVICE` on
 * every revision; Railway sets its `RAILWAY_*` ids on every deployment and
 * never `K_SERVICE`. Returns which one, for a log line, or null locally.
 *
 * NODE_ENV is not this test: staging runs NODE_ENV=staging and is public.
 */
const HOST_VARS = ['K_SERVICE', 'RAILWAY_SERVICE_ID', 'RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT_ID'] as const

export function deployedHost(): string | null {
  for (const name of HOST_VARS) {
    const value = process.env[name]
    if (value) return `${name}=${value}`
  }
  return null
}
