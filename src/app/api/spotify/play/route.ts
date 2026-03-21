import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const accessToken = (session as { accessToken?: string })?.accessToken;
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { trackId } = await req.json();
  if (!trackId) return NextResponse.json({ error: "trackId required" }, { status: 400 });

  const res = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
  });

  if (res.status === 404) return NextResponse.json({ error: "Kein aktives Spotify-Gerät" }, { status: 404 });
  if (!res.ok && res.status !== 204) return NextResponse.json({ error: "Playback fehlgeschlagen" }, { status: res.status });
  return NextResponse.json({ ok: true });
}
