import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { react } from "@/lib/game/store";
import { REACTION_KINDS, type ReactionKind } from "@/lib/game/types";

/** Nudges whoever has to continue (skip the song / "I love it"), see `react` in the store. */
export async function POST(req: Request, ctx: RouteContext<"/api/game/[id]/react">) {
  const { id } = await ctx.params;
  const playerId = requirePlayer(req, id);
  if (typeof playerId !== "string") return playerId;

  const body = await req.json().catch(() => null);
  const kind = REACTION_KINDS.find(k => k === body?.kind) as ReactionKind | undefined;
  if (!kind) return NextResponse.json({ error: "Ungültige Reaktion" }, { status: 400 });

  const error = react(id, playerId, kind);
  return error ? NextResponse.json({ error }, { status: 409 }) : NextResponse.json({ ok: true });
}
