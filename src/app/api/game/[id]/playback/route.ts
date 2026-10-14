import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { getHostToken } from "@/lib/game/store";
import { spotifyFetch } from "@/lib/spotify";

const IDLE = { isPlaying: false, progressMs: 0, durationMs: 0 };

export async function GET(req: Request, ctx: RouteContext<"/api/game/[id]/playback">) {
  const { id } = await ctx.params;
  const player = requirePlayer(req, id);
  if (typeof player !== "string") return player;

  const token = await getHostToken(id);
  if (!token) return NextResponse.json(IDLE);
  const res = await spotifyFetch(token, "/me/player");
  if (!res.ok || res.status === 204) return NextResponse.json(IDLE);

  const data = await res.json();
  return NextResponse.json({
    isPlaying: data.is_playing ?? false,
    progressMs: data.progress_ms ?? 0,
    durationMs: data.item?.duration_ms ?? 0,
  });
}
