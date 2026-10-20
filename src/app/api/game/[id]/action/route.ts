import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { parseAction } from "@/lib/game/reducer";
import { dispatch, gameView, getGame } from "@/lib/game/store";

export async function POST(req: Request, ctx: RouteContext<"/api/game/[id]/action">) {
  const { id } = await ctx.params;
  const playerId = requirePlayer(req, id);
  if (typeof playerId !== "string") return playerId;

  const action = parseAction(await req.json().catch(() => null), getGame(id)!.mode.id);
  if (!action) return NextResponse.json({ error: "Ungültige Aktion" }, { status: 400 });

  const result = await dispatch(id, playerId, action);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ game: gameView(id, playerId), spotifyError: result.spotifyError });
}
