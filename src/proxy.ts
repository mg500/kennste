import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (host.startsWith("localhost:")) {
    const url = request.nextUrl.clone();
    url.host = host.replace("localhost:", "127.0.0.1:");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
