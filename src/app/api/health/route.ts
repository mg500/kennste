import { NextResponse } from "next/server";
import pkg from "../../../../package.json";

// Always answer from the running server, never from a cache
export const dynamic = "force-dynamic";

/** Liveness check for Docker and reverse proxies: the server is up and answers requests, and which version runs. */
export function GET() {
  return NextResponse.json({ status: "ok", version: pkg.version }, { headers: { "Cache-Control": "no-store" } });
}
