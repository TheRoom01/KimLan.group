/** Drain all in-flight work before returning an error, so callers can safely roll back. */
export async function runSettledPool<T>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const errors: unknown[] = [];
  await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, limit)) }, async () => {
    while (next < items.length && errors.length === 0) {
      const index = next++;
      try { await worker(items[index], index); } catch (error) { errors.push(error); }
    }
  }));
  if (errors.length) throw errors[0];
}
