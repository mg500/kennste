/**
 * One line of JSON per event in the server log (`docker logs`), easy to read and to filter, e.g.
 * {"time":"…","event":"songChange","game":"ABCD","action":"next","ms":{"songs":0,"years":850,"play":1420},"totalMs":2270}
 */
export function logEvent(event: string, fields: Record<string, unknown>) {
  console.info(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));
}

/** Measures how long the steps of one operation take, to log them together. */
export function stopwatch() {
  const start = Date.now();
  const ms: Record<string, number> = {};
  return {
    ms,
    async time<T>(step: string, run: () => Promise<T>): Promise<T> {
      const t = Date.now();
      try {
        return await run();
      } finally {
        ms[step] = (ms[step] ?? 0) + Date.now() - t;
      }
    },
    total: () => Date.now() - start,
  };
}
