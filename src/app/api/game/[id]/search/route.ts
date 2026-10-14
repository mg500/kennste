import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { getHostToken } from "@/lib/game/store";
import { searchTracks } from "@/lib/spotify";

export async function GET(req: Request, ctx: RouteContext<"/api/game/[id]/search">) {
  const { id } = await ctx.params;
  const player = requirePlayer(req, id);
  if (typeof player !== "string") return player;

  const q = new URL(req.url).searchParams.get("q")?.trim();
  const token = await getHostToken(id);
  if (!q || !token) return NextResponse.json({ tracks: [] });
  return NextResponse.json({ tracks: await searchTracks(token, q) });
}
