/**
 * The "am I deployed" test: the host's service name, or null on a laptop.
 *
 * Cloud Run sets `K_SERVICE` on every revision; Railway sets
 * `RAILWAY_SERVICE_NAME` on every deployment. Neither is set locally. NODE_ENV
 * is not this test: staging runs NODE_ENV=staging and is public.
 *
 * A new host goes here too, or the dev-auth guard does not know it is deployed.
 */
export function deployedAs(): string | null {
  return process.env['K_SERVICE'] || process.env['RAILWAY_SERVICE_NAME'] || null
}
