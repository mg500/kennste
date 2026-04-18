import { NextResponse } from "next/server";
import { kickPlayer } from "@/lib/games";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { playerId } = await req.json();
  const game = kickPlayer(id, playerId);
  if (!game) return NextResponse.json({ error: "Not found or game already started" }, { status: 400 });
  const { hostToken: _, ...publicGame } = game;
  return NextResponse.json(publicGame);
}
