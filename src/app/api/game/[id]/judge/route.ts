import { NextResponse } from "next/server";
import { judge, getHostToken } from "@/lib/games";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { action } = await req.json() as { action: "correct" | "wrong" | "skip" };
  const game = judge(id, action);
  if (!game) return NextResponse.json({ error: "Cannot judge" }, { status: 400 });

  const token = (action === "wrong" || action === "correct") && game.settings.autoPauseOnBuzz ? await getHostToken(id) : null;
  if (token) {
    await fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  return NextResponse.json(game);
}
