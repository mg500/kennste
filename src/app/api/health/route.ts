import { NextResponse } from "next/server";
import { APP_BUILD, APP_VERSION } from "@/lib/version";

// Always answer from the running server, never from a cache
export const dynamic = "force-dynamic";

/** Liveness check for Docker and reverse proxies: the server is up and answers requests, and which version runs. */
export function GET() {
  return NextResponse.json({ status: "ok", version: APP_VERSION, ...(APP_BUILD ? { build: APP_BUILD } : {}) }, { headers: { "Cache-Control": "no-store" } });
}
