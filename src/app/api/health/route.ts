import { NextResponse } from "next/server";

// Always answer from the running server, never from a cache
export const dynamic = "force-dynamic";

/** Liveness check for Docker and reverse proxies: the server is up and answers requests. */
export function GET() {
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
