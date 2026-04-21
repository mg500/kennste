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
  if (typeof body.maxRounds === "number" && body.maxRounds >= 1 && body.maxRounds <= 20) {
    game.settings.maxRounds = body.maxRounds;
  }
  if (body.playerOrder === "sequential" || body.playerOrder === "random") {
    game.settings.playerOrder = body.playerOrder;
  }
  if (typeof body.maxBuzzesPerRound === "number" && body.maxBuzzesPerRound >= 1 && body.maxBuzzesPerRound <= 5) {
    game.settings.maxBuzzesPerRound = body.maxBuzzesPerRound;
  }
  if (typeof body.buzzTimeLimit === "number" && body.buzzTimeLimit >= 0 && body.buzzTimeLimit <= 120) {
    game.settings.buzzTimeLimit = body.buzzTimeLimit;
  }
  if (body.hintsEnabled && typeof body.hintsEnabled === "object") {
    game.settings.hintsEnabled = { ...game.settings.hintsEnabled, ...body.hintsEnabled };
  }
  const { hostToken: _, ...publicGame } = game;
  return NextResponse.json(publicGame);
}
