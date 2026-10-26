/**
 * Structured, PII-redacting logger, ported from line-bot.
 *
 * LINE user ids, display names and tokens must never land in logs (PDPA).
 * Meta keys whose name signals sensitive content are masked wholesale, and
 * free text is scrubbed for LINE ids and Bearer tokens. This is the only
 * place bare `console.*` is allowed (eslint `no-console`).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_PREFIX = '[shrimpscan-bot]'

// Non-global on purpose: `.test()` on a /g regex is stateful.
export const SENSITIVE_KEY_RE =
  /(line_?user_?id|^userid$|^user_id$|displayname|display_name|access_?token|id_?token|channel_?secret|channel_?access_?token|service_?role|api_?key|authorization|bearer|password|private_?key)/i

// LINE user ids: 'U' followed by 32 hex chars (also group 'C' and room 'R').
const LINE_ID_RE = /\b[UCR][0-9a-f]{32}\b/gi
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._-]+/gi

function maskId(id: string): string {
  return `${id.slice(0, 1)}***${id.slice(-4)}`
}

export function redactString(s: string): string {
  return s.replace(BEARER_RE, 'Bearer [REDACTED]').replace(LINE_ID_RE, (m) => maskId(m))
}

function redactValue(value: unknown, keyHint?: string): unknown {
  if (keyHint && SENSITIVE_KEY_RE.test(keyHint)) return '[REDACTED]'
  if (typeof value === 'string') return redactString(value)
  if (Array.isArray(value)) return value.map((v) => redactValue(v))
  if (value && typeof value === 'object') {
    if (value instanceof Error) return redactString(`${value.name}: ${value.message}`)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactValue(v, k)
    return out
  }
  return value
}

function safeStringify(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** A leading string is the message; one trailing plain object is the meta. */
function normalizeArgs(args: unknown[]): { message: string; meta?: Record<string, unknown> } {
  if (args.length === 0) return { message: '' }
  const [first, ...rest] = args
  const message =
    typeof first === 'string' ? first : first instanceof Error ? `${first.name}: ${first.message}` : safeStringify(first)
  if (rest.length === 0) return { message }
  const only = rest[0]
  if (rest.length === 1 && only !== null && typeof only === 'object' && !Array.isArray(only) && !(only instanceof Error)) {
    return { message, meta: only as Record<string, unknown> }
  }
  return { message, meta: { details: rest.length === 1 ? only : rest } }
}

function emit(level: LogLevel, rawMessage: string, rawMeta?: Record<string, unknown>): void {
  const message = redactString(rawMessage)
  const meta = rawMeta ? (redactValue(rawMeta) as Record<string, unknown>) : undefined
  // Deployed (Cloud Run): one JSON line per entry, which Cloud Logging parses.
  if (process.env.K_SERVICE) {
    const entry = { severity: level.toUpperCase(), message: `${LOG_PREFIX} ${message}`, timestamp: new Date().toISOString(), ...meta }
    const line = JSON.stringify(entry) + '\n'
    if (level === 'error' || level === 'warn') process.stderr.write(line)
    else process.stdout.write(line)
    return
  }
  const text = `${LOG_PREFIX} [${level.toUpperCase()}] ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`
  if (level === 'error') console.error(text)
  else if (level === 'warn') console.warn(text)
  else console.log(text)
}

function log(level: LogLevel, args: unknown[]): void {
  const { message, meta } = normalizeArgs(args)
  emit(level, message, meta)
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', args),
  info: (...args: unknown[]) => log('info', args),
  warn: (...args: unknown[]) => log('warn', args),
  error: (...args: unknown[]) => log('error', args),
}
