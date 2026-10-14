import { NextResponse } from "next/server";
import { startGame } from "@/lib/games";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const game = startGame(id);
  if (!game) return NextResponse.json({ error: "Cannot start" }, { status: 400 });
  return NextResponse.json(game);
}
