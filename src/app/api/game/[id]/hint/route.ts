import { NextResponse } from "next/server";
import { getGame } from "@/lib/games";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const game = getGame(id);
  if (!game?.round || game.round.state !== "playing") return NextResponse.json({ error: "Not in playing state" }, { status: 400 });
  const body = req.headers.get("content-length") !== "0" ? await req.json().catch(() => ({})) : {};
  const type = body.type ?? "cover";
  if (type === "title") game.round = { ...game.round, hintTitleRevealed: true };
  else if (type === "artist") game.round = { ...game.round, hintArtistRevealed: true };
  else if (type === "year") game.round = { ...game.round, hintYearRevealed: true };
  else game.round = { ...game.round, hintRevealed: true };
  return NextResponse.json(game);
}
