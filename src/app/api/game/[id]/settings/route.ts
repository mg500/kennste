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
  if (body.gameMode === "rounds" || body.gameMode === "bestOf") {
    game.settings.gameMode = body.gameMode;
  }
  if (typeof body.maxRounds === "number" && body.maxRounds >= 1 && body.maxRounds <= 20) {
    game.settings.maxRounds = body.maxRounds;
  }
  if (typeof body.bestOf === "number" && body.bestOf >= 1 && body.bestOf <= 20) {
    game.settings.bestOf = body.bestOf;
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
  if (typeof body.playTimeLimit === "number" && body.playTimeLimit >= 0 && body.playTimeLimit <= 300) {
    game.settings.playTimeLimit = body.playTimeLimit;
  }
  if (body.hintsEnabled && typeof body.hintsEnabled === "object") {
    game.settings.hintsEnabled = { ...game.settings.hintsEnabled, ...body.hintsEnabled };
  }
  if (body.songSource === "players" || body.songSource === "playlist") {
    game.settings.songSource = body.songSource;
  }
  const { hostToken: _, ...publicGame } = game;
  return NextResponse.json(publicGame);
}
