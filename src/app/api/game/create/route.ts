import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { createGame, joinGame, setHostSession } from "@/lib/games";

export async function POST() {
  const session = await getServerSession(authOptions);
  const hostToken = (session as { accessToken?: string })?.accessToken;
  const userId = session?.user?.email ?? session?.user?.name ?? null;
  const hostName = (session?.user?.name ?? "Host").split(" ")[0];

  const game = createGame(hostToken);
  const result = joinGame(game.id, hostName);
  if (!result) return NextResponse.json({ error: "Failed" }, { status: 500 });

  if (userId) setHostSession(userId, game.id, result.playerId);

  const { hostToken: _, ...publicGame } = result.game;
  return NextResponse.json({ id: game.id, playerId: result.playerId, game: publicGame });
}
