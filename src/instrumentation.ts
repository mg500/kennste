/** Runs once when the server starts (see Next.js instrumentation). */
export async function register() {
  // Imported inside the check, not after an early return: webpack only leaves out what's in a branch it knows is dead,
  // and node:fs/node:crypto break the edge build of this file (dev server with --webpack)
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node");
}
