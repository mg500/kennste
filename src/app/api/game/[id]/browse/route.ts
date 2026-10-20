import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { getHostToken } from "@/lib/game/store";
import { browseQuery, parseBrowseFilter } from "@/lib/browse";
import { searchTracks } from "@/lib/spotify";

const PAGE = 10;
const MAX_OFFSET = 990;

/** Songs of a decade and/or genre, page by page (`offset`); `more` tells whether another page may follow. */
export async function GET(req: Request, ctx: RouteContext<"/api/game/[id]/browse">) {
  const { id } = await ctx.params;
  const player = requirePlayer(req, id);
  if (typeof player !== "string") return player;

  const params = new URL(req.url).searchParams;
  const q = browseQuery(parseBrowseFilter(params));
  const offset = Math.min(MAX_OFFSET, Math.max(0, Math.floor(Number(params.get("offset")) || 0)));
  const token = await getHostToken(id);
  if (!q || !token) return NextResponse.json({ tracks: [], more: false });
  const tracks = await searchTracks(token, q, PAGE, offset);
  // Spotify may return fewer than asked for and still have more (seen for a search by year alone): only an empty
  // page is the end
  return NextResponse.json({ tracks, more: tracks.length > 0 && offset + tracks.length <= MAX_OFFSET });
}
