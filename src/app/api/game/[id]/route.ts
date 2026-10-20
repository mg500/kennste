import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { closeGame, getGame } from "@/lib/game/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/game/[id]">) {
  const { id } = await ctx.params;
  const game = getGame(id);
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
