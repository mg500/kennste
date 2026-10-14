import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { isModeId } from "@/lib/game/modes";
import { createGame } from "@/lib/game/store";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const jwt = await getToken({ req });
  if (!session || !jwt?.accessToken || !jwt.refreshToken) {
    return NextResponse.json({ error: "Nicht mit Spotify angemeldet" }, { status: 401 });
  }
  const userId = session.user?.email ?? session.user?.name ?? null;
  const hostName = (session.user?.name ?? "Host").split(" ")[0];

  const body = await req.json().catch(() => null);
  const mode = isModeId(body?.mode) ? body.mode : "buzzer";

  const result = createGame(hostName, {
    accessToken: jwt.accessToken,
    refreshToken: jwt.refreshToken,
    expiresAt: jwt.expiresAt ?? Date.now() + 3600 * 1000,
  }, userId, mode);
  return NextResponse.json(result);
}
