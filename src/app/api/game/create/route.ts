import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { createGame, joinGame, setHostAuth, setHostSession } from "@/lib/games";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const jwt = await getToken({ req });
  const userId = session?.user?.email ?? session?.user?.name ?? null;
  const hostName = (session?.user?.name ?? "Host").split(" ")[0];

  const game = createGame();
  if (jwt?.accessToken && jwt.refreshToken) {
    setHostAuth(game.id, {
      accessToken: jwt.accessToken,
      refreshToken: jwt.refreshToken,
      expiresAt: jwt.expiresAt ?? Date.now() + 3600 * 1000,
    });
  }
  const result = joinGame(game.id, hostName);
  if (!result) return NextResponse.json({ error: "Failed" }, { status: 500 });

  if (userId) setHostSession(userId, game.id, result.playerId);

  return NextResponse.json({ id: game.id, playerId: result.playerId, game: result.game });
}
