import { NextResponse } from "next/server";
import { buzz } from "@/lib/games";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { playerId } = await req.json();
  const game = buzz(id, playerId);
  if (!game) return NextResponse.json({ error: "Cannot buzz" }, { status: 400 });

  if (game.settings.autoPauseOnBuzz && game.hostToken) {
    await fetch("https://api.spotify.com/v1/me/player/pause", {
      method: "PUT",
      headers: { Authorization: `Bearer ${game.hostToken}` },
    }).catch(() => {});
  }

  const { hostToken: _, ...publicGame } = game;
  return NextResponse.json(publicGame);
}
