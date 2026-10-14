import { NextResponse } from "next/server";
import { getHostToken } from "@/lib/games";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = await getHostToken(id);
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

  const body = req.headers.get("content-length") !== "0" ? await req.json().catch(() => ({})) : {};
  const { trackId } = body;

  const res = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: trackId ? JSON.stringify({ uris: [`spotify:track:${trackId}`] }) : undefined,
  });

  if (res.status === 404) return NextResponse.json({ error: "Kein aktives Spotify-Gerät" }, { status: 404 });
  if (!res.ok && res.status !== 204) return NextResponse.json({ error: "Playback fehlgeschlagen" }, { status: res.status });
  return NextResponse.json({ ok: true });
}
