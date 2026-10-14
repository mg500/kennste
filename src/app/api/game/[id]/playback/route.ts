import { NextResponse } from "next/server";
import { getHostToken } from "@/lib/games";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = await getHostToken(id);
  if (!token) return NextResponse.json({ isPlaying: false, progressMs: 0, durationMs: 0 });

  const res = await fetch("https://api.spotify.com/v1/me/player", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok || res.status === 204) {
    return NextResponse.json({ isPlaying: false, progressMs: 0, durationMs: 0 });
  }

  const data = await res.json();
  return NextResponse.json({
    isPlaying: data.is_playing ?? false,
    progressMs: data.progress_ms ?? 0,
    durationMs: data.item?.duration_ms ?? 0,
  });
}
