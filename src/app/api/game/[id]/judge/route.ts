import { NextResponse } from "next/server";
import { judge } from "@/lib/games";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { action } = await req.json() as { action: "correct" | "wrong" | "skip" };
  const game = judge(id, action);
  if (!game) return NextResponse.json({ error: "Cannot judge" }, { status: 400 });

  if ((action === "wrong" || action === "correct") && game.settings.autoPauseOnBuzz && game.hostToken) {
    await fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: { Authorization: `Bearer ${game.hostToken}` },
    }).catch(() => {});
  }

  const { hostToken: _, ...publicGame } = game;
  return NextResponse.json(publicGame);
}
