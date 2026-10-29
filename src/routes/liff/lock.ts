/**
 * One request at a time per key, in this process. Railway runs one instance,
 * so this is enough to turn a double tap into one write; the database's
 * unique keys stay the backstop.
 */

const running = new Map<string, Promise<unknown>>()

export async function oneAtATime<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const before = running.get(key) ?? Promise.resolve()
  const run = before.catch(() => undefined).then(fn)
  running.set(key, run)
  try {
    return await run
  } finally {
    if (running.get(key) === run) running.delete(key)
  }
}
