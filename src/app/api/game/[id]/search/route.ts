import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { getHostToken } from "@/lib/game/store";
import { searchTracks } from "@/lib/spotify";

/** Results per page – Spotify's search allows more, but loading on scroll keeps every answer fast. */
const PAGE = 10;
/** Spotify returns nothing beyond offset 1000. */
const MAX_OFFSET = 990;

/** Songs matching `q`, page by page (`offset`); `more` tells whether another page may follow. */
export async function GET(req: Request, ctx: RouteContext<"/api/game/[id]/search">) {
  const { id } = await ctx.params;
  const player = requirePlayer(req, id);
  if (typeof player !== "string") return player;

  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  const offset = Math.min(MAX_OFFSET, Math.max(0, Math.floor(Number(params.get("offset")) || 0)));
  const token = await getHostToken(id);
  if (!q || !token) return NextResponse.json({ tracks: [], more: false });
  const tracks = await searchTracks(token, q, PAGE, offset);
  return NextResponse.json({ tracks, more: tracks.length === PAGE && offset + PAGE <= MAX_OFFSET });
}
