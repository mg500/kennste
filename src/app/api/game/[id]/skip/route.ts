import { NextResponse } from "next/server";
import { skipPlayer } from "@/lib/games";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { playerId } = await req.json();
  const game = skipPlayer(id, playerId);
  if (!game) return NextResponse.json({ error: "Failed" }, { status: 400 });
  return NextResponse.json(game);
}
