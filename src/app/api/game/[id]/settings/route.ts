import { NextResponse } from "next/server";
import { getGame } from "@/lib/games";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const game = getGame(id);
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  if (typeof body.autoPauseOnBuzz === "boolean") {
    game.settings.autoPauseOnBuzz = body.autoPauseOnBuzz;
  }
  const { hostToken: _, ...publicGame } = game;
  return NextResponse.json(publicGame);
}
