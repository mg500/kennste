import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { pairScreen } from "@/lib/game/pairing";

/** The host connects a TV by the code it shows (see pairing.ts). */
export async function POST(req: Request, ctx: RouteContext<"/api/game/[id]/screen">) {
  const { id } = await ctx.params;
  const playerId = requirePlayer(req, id, { host: true });
  if (typeof playerId !== "string") return playerId;
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!/^\d{4}$/.test(code)) return NextResponse.json({ error: "Der Code hat 4 Ziffern" }, { status: 400 });
  const error = pairScreen(id, code);
  return error ? NextResponse.json({ error }, { status: 409 }) : NextResponse.json({ ok: true });
}
