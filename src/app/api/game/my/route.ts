import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getGame, getHostSession, clearHostSession } from "@/lib/games";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.email ?? session?.user?.name ?? null;
  if (!userId) return NextResponse.json(null);

  const hs = getHostSession(userId);
  if (!hs) return NextResponse.json(null);

  const game = getGame(hs.gameId);
  if (!game) {
    clearHostSession(userId);
    return NextResponse.json(null);
  }

  return NextResponse.json({ gameId: hs.gameId, playerId: hs.playerId, game: game });
}
