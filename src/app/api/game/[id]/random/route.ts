import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { getHostToken } from "@/lib/game/store";
import { searchTracks } from "@/lib/spotify";

const CHARS = "abcdefghijklmnopqrstuvwxyz";

export async function GET(req: Request, ctx: RouteContext<"/api/game/[id]/random">) {
  const { id } = await ctx.params;
  const player = requirePlayer(req, id);
  if (typeof player !== "string") return player;

  const token = await getHostToken(id);
  if (!token) return NextResponse.json({ track: null });
  const letter = CHARS[Math.floor(Math.random() * CHARS.length)];
  const [track] = await searchTracks(token, letter, 1, Math.floor(Math.random() * 50));
  return NextResponse.json({ track: track ?? null });
}
