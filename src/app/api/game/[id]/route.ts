import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { deleteGame, getGame } from "@/lib/game/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/game/[id]">) {
  const { id } = await ctx.params;
  const game = getGame(id);
  if (!game) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });
  return NextResponse.json(game);
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/game/[id]">) {
  const { id } = await ctx.params;
  const host = requirePlayer(req, id, { host: true });
  if (typeof host !== "string") return host;
  deleteGame(id);
  return NextResponse.json({ ok: true });
}
