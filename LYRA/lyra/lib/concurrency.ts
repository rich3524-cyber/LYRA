/**
 * Runs `fn` over `items` with at most `limit` calls in flight at once,
 * preserving input order in the returned array. Used anywhere a per-row
 * external fetch (bulk-import media re-hosting/validation) would otherwise
 * fire once per row with no cap -- unbounded concurrency on up to
 * BULK_IMPORT_MAX_DATA_ROWS (500) rows is a real resource-exhaustion risk,
 * not just a style preference (see the 2026-08-13 security/performance review).
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
