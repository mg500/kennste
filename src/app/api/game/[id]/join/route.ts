import { NextResponse } from "next/server";
import { getGame, joinGame } from "@/lib/game/store";

export async function POST(req: Request, ctx: RouteContext<"/api/game/[id]/join">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 20) : "";
  if (!name) return NextResponse.json({ error: "Name fehlt" }, { status: 400 });
  const game = getGame(id);
  if (!game) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });
  if (game.closedAt) return NextResponse.json({ error: "Die Lobby ist geschlossen" }, { status: 403 });
  if (game.status !== "lobby") return NextResponse.json({ error: "Spiel läuft bereits" }, { status: 403 });
  const result = joinGame(id, name);
  if (!result) return NextResponse.json({ error: "Spiel läuft bereits" }, { status: 403 });
  return NextResponse.json(result);
}
