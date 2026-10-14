import { NextResponse } from "next/server";
import { getGame, toggleViewer } from "@/lib/games";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { hostPlayerId, playerId } = await req.json();
  const game = getGame(id);
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (game.hostPlayerId !== hostPlayerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (playerId === hostPlayerId) return NextResponse.json({ error: "Host cannot be viewer" }, { status: 400 });
  const updated = toggleViewer(id, playerId);
  if (!updated) return NextResponse.json({ error: "Failed" }, { status: 400 });
  return NextResponse.json(updated);
}
