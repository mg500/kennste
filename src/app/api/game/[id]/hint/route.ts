import { NextResponse } from "next/server";
import { getGame } from "@/lib/games";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const game = getGame(id);
  if (!game?.round || game.round.state !== "playing") return NextResponse.json({ error: "Not in playing state" }, { status: 400 });
  game.round = { ...game.round, hintRevealed: true };
  const { hostToken: _, ...publicGame } = game;
  return NextResponse.json(publicGame);
}
