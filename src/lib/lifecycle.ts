/**
 * Server shutdown (SIGTERM from Docker/Kubernetes). Next.js waits for open requests before it exits, but the
 * games' event streams never end on their own – so they are closed here, the clients reconnect by themselves.
 */
interface Lifecycle { shuttingDown: boolean; hooks: Set<() => void> }

// Kept on globalThis so state survives hot reloads in dev
const g = globalThis as typeof globalThis & { __lifecycle__?: Lifecycle };
const lifecycle: Lifecycle = (g.__lifecycle__ ??= { shuttingDown: false, hooks: new Set() });

/** Runs `fn` when the server shuts down. Returns a function to unregister it. */
export function onShutdown(fn: () => void): () => void {
  lifecycle.hooks.add(fn);
  return () => { lifecycle.hooks.delete(fn); };
}

export function isShuttingDown(): boolean {
  return lifecycle.shuttingDown;
}

export function beginShutdown() {
  if (lifecycle.shuttingDown) return;
  lifecycle.shuttingDown = true;
  for (const fn of [...lifecycle.hooks]) fn();
  lifecycle.hooks.clear();
}

/** For tests. */
export function resetLifecycle() {
  lifecycle.shuttingDown = false;
  lifecycle.hooks.clear();
}
