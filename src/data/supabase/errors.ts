/** PostgREST errors as the repositories report them. */

export interface PgError {
  message?: string
  code?: string
}

/** A failed read or write: the route answers 500 internal_error and logs `what`. */
export function dbFail(what: string, error: PgError | null | undefined): Error {
  return Object.assign(new Error(`[db] ${what}: ${error?.message ?? 'unknown error'}`), { cause: error })
}

export function isUniqueViolation(error: PgError | null | undefined): boolean {
  return error?.code === '23505' || /duplicate key/i.test(String(error?.message ?? ''))
}
