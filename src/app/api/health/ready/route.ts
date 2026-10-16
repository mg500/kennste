import { NextResponse } from "next/server";
import { isShuttingDown } from "@/lib/lifecycle";

// Always answer from the running server, never from a cache
export const dynamic = "force-dynamic";

/** Readiness: 503 once the server shuts down, so no new players are sent here (liveness: /api/health). */
export function GET() {
  const ready = !isShuttingDown();
  return NextResponse.json({ ready }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
