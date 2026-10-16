/** Runs once when the server starts (see Next.js instrumentation). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { beginShutdown } = await import("./lib/lifecycle");
  // Next.js has its own handlers that wait for open requests; this one ends the event streams so they can finish
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, beginShutdown);
}
