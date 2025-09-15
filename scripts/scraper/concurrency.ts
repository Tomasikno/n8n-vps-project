export async function processWithConcurrency<T>(
  items: T[],
  worker: (item: T, idx: number) => Promise<any>,
  concurrency: number,
  delay = 0
): Promise<any[]> {
  const results: any[] = [];
  let index = 0;
  async function next() {
    if (index >= items.length) return;
    const i = index++;
    try {
      const res = await worker(items[i], i);
      if (res) results.push(res);
    } catch (err: any) {
      console.error(`Error on item ${i}:`, err?.message || err);
    } finally {
      if (delay) await new Promise((res) => setTimeout(res, delay));
      await next();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return results;
}
