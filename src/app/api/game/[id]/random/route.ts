import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { getHostToken } from "@/lib/game/store";
import { browseQuery, parseBrowseFilter } from "@/lib/browse";
import { searchTracks } from "@/lib/spotify";

/** How deep into the results a random song may come from (the number of matches is unknown). */
const SPREAD = 200;

/** A random song of a decade and/or genre. */
export async function GET(req: Request, ctx: RouteContext<"/api/game/[id]/random">) {
  const { id } = await ctx.params;
  const player = requirePlayer(req, id);
  if (typeof player !== "string") return player;

  const q = browseQuery(parseBrowseFilter(new URL(req.url).searchParams));
  const token = await getHostToken(id);
  if (!q || !token) return NextResponse.json({ track: null });
  const pick = async (spread: number) => (await searchTracks(token, q, 1, Math.floor(Math.random() * spread)))[0];
  // Few matches: a random offset may be past the end – then closer to the start, at last the first match
  const track = (await pick(SPREAD)) ?? (await pick(10)) ?? (await pick(1));
  return NextResponse.json({ track: track ?? null });
}
