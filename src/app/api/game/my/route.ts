import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getGame, getHostSession } from "@/lib/game/store";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.email ?? session?.user?.name ?? null;
  const hs = userId ? getHostSession(userId) : undefined;
  if (!hs) return NextResponse.json(null);
  return NextResponse.json({ ...hs, game: getGame(hs.gameId) });
}
