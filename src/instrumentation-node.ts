// Server start in the Node.js runtime (see instrumentation.ts)
import { beginShutdown } from "./lib/lifecycle";
import { checkDataDir } from "./lib/playedSongs";

// Next.js has its own handlers that wait for open requests; this one ends the event streams so they can finish
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, beginShutdown);
checkDataDir();
