import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { closeGame, gameView, resolvePlayer } from "@/lib/game/store";
import { PLAYER_TOKEN_HEADER } from "@/lib/game/types";

/** The game as the calling player (token header) may see it; without one as a spectator. */
export async function GET(req: Request, ctx: RouteContext<"/api/game/[id]">) {
  const { id } = await ctx.params;
  const game = gameView(id, resolvePlayer(id, req.headers.get(PLAYER_TOKEN_HEADER)));
  if (!game) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });
  return NextResponse.json(game);
}

/** Host: closes the lobby (see closeGame). */
export async function DELETE(req: Request, ctx: RouteContext<"/api/game/[id]">) {
  const { id } = await ctx.params;
  const host = requirePlayer(req, id, { host: true });
  if (typeof host !== "string") return host;
  // `closed`: everyone sees the evening's summary now; otherwise the game is gone
  return NextResponse.json({ ok: true, closed: await closeGame(id) });
}
