import { NextResponse } from "next/server";
import { pairingStatus } from "@/lib/game/pairing";

/** The TV polls whether the host connected it yet. 404: the code ran out, the TV asks for a new one. */
export async function GET(_req: Request, ctx: RouteContext<"/api/tv/[screenId]">) {
  const { screenId } = await ctx.params;
  const status = pairingStatus(screenId);
  return status
    ? NextResponse.json(status, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ error: "Abgelaufen" }, { status: 404 });
}
