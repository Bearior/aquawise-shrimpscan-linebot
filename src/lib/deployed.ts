/**
 * The "am I deployed" test: the host's service name (or one of Railway's ids),
 * or null on a laptop.
 *
 * Cloud Run sets `K_SERVICE` on every revision; Railway sets
 * `RAILWAY_SERVICE_NAME` and its `RAILWAY_*_ID`s on every deployment and never
 * `K_SERVICE`. None is set locally. NODE_ENV is not this test: staging runs
 * NODE_ENV=staging and is public (and on Railway it reads the PROD database).
 *
 * A new host goes here too, or the dev-auth guard does not know it is deployed.
 */
const HOST_VARS = ['K_SERVICE', 'RAILWAY_SERVICE_NAME', 'RAILWAY_SERVICE_ID', 'RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT_ID'] as const

export function deployedAs(): string | null {
  for (const name of HOST_VARS) {
    const value = process.env[name]
    if (value) return value
  }
  return null
}
