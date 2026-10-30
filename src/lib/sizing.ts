/**
 * HTTP client for the shrimp sizing service (cloud-services/shrimp-sizing), a
 * trimmed port of line-bot's src/lib/services/sizing/client.ts (launch-prep):
 * the rim finder and the measure, nothing else.
 *
 * - Env read at call time (`SIZING_SERVICE_URL`, `SIZING_SERVICE_SECRET`): both
 *   or it is not configured. The service answers 401 without the secret.
 * - Never throws: every call returns a `SizingResult`.
 * - No retry, ever. A measure bills SAM3 calls; retrying after a timeout could
 *   bill them twice. The caller refunds the quota.
 *
 * The types mirror the Python /v1 contract as line-bot's types.ts writes it.
 */

import { logger } from './logger.js'

export type SizingStatus = 'ok' | 'retake' | 'error'
export type SizingRetakeReason = 'no_rim' | 'too_few_shrimp' | 'no_shrimp_found'
export type SizingFlag = 'colour_rim' | 'low_rim_confidence' | 'brightened' | 'needed_tiles' | 'low_resolution' | 'hand_rim' | 'few_shrimp'
export type SizingErrorCode =
  | 'bad_image'
  | 'no_diameter'
  | 'deadline'
  | 'sam3_not_configured'
  | 'sam3_cache_miss'
  | 'sam3_bad_key'
  | 'sam3_out_of_credits'
  | 'sam3_workflow_not_found'
  | 'sam3_timeout'
  | 'sam3_error'
  | 'bad_ring'

export interface SizingEstimate {
  abw_g: number
  range_g: [number, number]
  range_kind: string
  shrimp_per_kg: number
  n: number
  mean_length_cm: number
  /** Spread of the individual weights, in percent. */
  cv_pct: number
}

/**
 * The rim ellipse as fractions of the photo: `cx` of the width, `cy` of the
 * height, `a` and `b` (semi-axes) both of the WIDTH, `theta` in radians, the
 * direction of `a` (y down). See src/domain/rim-geometry.ts for the affine.
 */
export interface SizingTrayEllipse {
  cx: number
  cy: number
  a: number
  b: number
  theta: number
}

export interface SizingTray {
  diameter_cm?: number
  px_per_cm?: number
  /** The flattened canvas's side, canvas px. */
  canvas_px?: number
  ellipse?: SizingTrayEllipse
  [key: string]: unknown
}

export interface SizingShrimp {
  id: number
  /** Position on the flattened ยอ, 0-1 of the canvas. */
  x: number
  y: number
  length_cm: number
  weight_g: number
  confidence: number
  source: string
}

/** POST /v1/measure. */
export interface SizingMeasureResponse {
  run_id: string | null
  status: SizingStatus
  retake_reason: SizingRetakeReason | null
  error_code: SizingErrorCode | null
  error_detail?: string
  pipeline_version: string
  diameter_provisional: boolean
  flags: SizingFlag[]
  /** Clean shrimp before the length rules, canvas px, in the estimate's order. */
  px_lengths: number[]
  rim_radius_px: number | null
  sam3_calls: number
  /** HTTP requests sent to SAM3, retries included: what Roboflow can bill. */
  sam3_http_attempts: number
  estimate?: SizingEstimate
  shrimp?: SizingShrimp[]
  tray?: SizingTray
  versions: { pipeline: string; [key: string]: unknown }
  secs?: number
}

/** A rim ring, `[cx/W, cy/H, a/W, b/W, theta]`: SizingTrayEllipse as a tuple. `a >= b`. */
export type SizingRing = [number, number, number, number, number]

/** POST /v1/rim: the rim finder alone (no SAM3, CPU only, free). */
export interface SizingRimResponse {
  found: boolean
  ring: SizingRing | null
  source: 'M1' | 'colour' | 'M1-low' | null
  confidence: number
  working_px: [number, number]
  pipeline_version: string
}

export type SizingFailureCode = 'NOT_CONFIGURED' | 'TIMEOUT' | 'ERROR'

/** Never thrown: every call returns one of these. `httpStatus` is set when the service answered non-2xx. */
export type SizingResult<T> = { ok: true; data: T } | { ok: false; code: SizingFailureCode; httpStatus?: number }

export type SizingImageType = 'image/jpeg' | 'image/png' | 'image/webp'

/** Above the service's own 40 s deadline, so it answers `deadline` with its counts before this side gives up. */
export const SIZING_MEASURE_TIMEOUT_MS = 55_000
/** The rim finder is CPU only, a few seconds warm; the margin covers a cold start. */
export const SIZING_RIM_TIMEOUT_MS = 30_000

const EXTENSION: Record<SizingImageType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

function serviceConfig(): { url: string; secret: string } | null {
  const url = (process.env.SIZING_SERVICE_URL || '').replace(/\/+$/, '')
  const secret = process.env.SIZING_SERVICE_SECRET || ''
  return url && secret ? { url, secret } : null
}

async function call<T>(path: string, body: FormData, timeoutMs: number, isValid: (data: unknown) => boolean): Promise<SizingResult<T>> {
  const config = serviceConfig()
  if (!config) return { ok: false, code: 'NOT_CONFIGURED' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${config.url}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.secret}` },
      body,
      signal: controller.signal,
    })
    if (!response.ok) {
      // The status rides in the message too: Railway's log view drops the meta.
      logger.error(`[sizing] service answered ${response.status} on ${path}`, { path, status: response.status })
      return { ok: false, code: 'ERROR', httpStatus: response.status }
    }
    const data: unknown = await response.json()
    if (!isValid(data)) {
      logger.error(`[sizing] service answered outside the /v1 contract on ${path}`, { path })
      return { ok: false, code: 'ERROR', httpStatus: response.status }
    }
    return { ok: true, data: data as T }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      logger.error(`[sizing] service timed out on ${path} after ${timeoutMs} ms`, { path, timeoutMs })
      return { ok: false, code: 'TIMEOUT' }
    }
    const why = error instanceof Error ? error.message : String(error)
    logger.error(`[sizing] request failed on ${path}: ${why}`, { path, error: why })
    return { ok: false, code: 'ERROR' }
  } finally {
    clearTimeout(timer)
  }
}

const isObject = (d: unknown): d is Record<string, unknown> => typeof d === 'object' && d !== null
const isRing = (d: unknown): boolean => Array.isArray(d) && d.length === 5 && d.every((v) => typeof v === 'number' && Number.isFinite(v))

function isRim(d: unknown): boolean {
  return isObject(d) && typeof d.found === 'boolean' && (d.ring === null || isRing(d.ring)) && typeof d.confidence === 'number'
}

function isMeasure(d: unknown): boolean {
  return (
    isObject(d) &&
    (d.status === 'ok' || d.status === 'retake' || d.status === 'error') &&
    typeof d.pipeline_version === 'string' &&
    Array.isArray(d.px_lengths) &&
    (d.status !== 'ok' || isObject(d.estimate))
  )
}

function photoForm(image: Uint8Array, type: SizingImageType): FormData {
  const form = new FormData()
  // The copy gives Blob a plain ArrayBuffer (a Node Buffer may sit on a shared pool).
  form.append('image', new Blob([new Uint8Array(image)], { type }), `photo.${EXTENSION[type]}`)
  return form
}

/** Find the ยอ rim on a photo, no SAM3 and no charge (POST /v1/rim). `found: false` has `ring: null`. */
export async function detectRim(image: Uint8Array, type: SizingImageType, opts: { timeoutMs?: number } = {}): Promise<SizingResult<SizingRimResponse>> {
  return call<SizingRimResponse>('/v1/rim', photoForm(image, type), opts.timeoutMs ?? SIZING_RIM_TIMEOUT_MS, isRim)
}

/** Measure one photo on the ring the person placed (`rim_source 'farmer'`), at the ยอ's diameter. */
export async function measure(
  image: Uint8Array,
  type: SizingImageType,
  opts: { diameterCm: number; rimEllipse: SizingRing; runId?: string; timeoutMs?: number },
): Promise<SizingResult<SizingMeasureResponse>> {
  const form = photoForm(image, type)
  form.append('diameter_cm', String(opts.diameterCm))
  if (opts.runId) form.append('run_id', opts.runId)
  form.append('rim_ellipse', JSON.stringify(opts.rimEllipse))
  form.append('rim_source', 'farmer')
  return call<SizingMeasureResponse>('/v1/measure', form, opts.timeoutMs ?? SIZING_MEASURE_TIMEOUT_MS, isMeasure)
}

/** What the routes call, so tests can stand in for the service. */
export interface SizingClient {
  detectRim: (image: Uint8Array, type: SizingImageType) => Promise<SizingResult<SizingRimResponse>>
  measure: (
    image: Uint8Array,
    type: SizingImageType,
    opts: { diameterCm: number; rimEllipse: SizingRing; runId?: string },
  ) => Promise<SizingResult<SizingMeasureResponse>>
}

export const sizingService: SizingClient = {
  detectRim: (image, type) => detectRim(image, type),
  measure: (image, type, opts) => measure(image, type, opts),
}
