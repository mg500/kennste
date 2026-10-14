import { NextResponse } from "next/server";
import { buzz, getHostToken } from "@/lib/games";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { playerId } = await req.json();
  const game = buzz(id, playerId);
  if (!game) return NextResponse.json({ error: "Cannot buzz" }, { status: 400 });

  const token = game.settings.autoPauseOnBuzz ? await getHostToken(id) : null;
  if (token) {
    await fetch("https://api.spotify.com/v1/me/player/pause", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  return NextResponse.json(game);
}
