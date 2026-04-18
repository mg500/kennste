import { NextResponse } from "next/server";
import { getGame, joinGame } from "@/lib/games";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const game = getGame(id);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (game.status !== "lobby") return NextResponse.json({ error: "Game already started" }, { status: 403 });
  const result = joinGame(id, name.trim());
  if (!result) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  return NextResponse.json({ playerId: result.playerId, game: result.game });
}
