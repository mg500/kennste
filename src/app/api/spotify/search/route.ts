import { NextResponse } from "next/server";
import { sessionAccessToken } from "@/lib/auth";
import { searchTracks } from "@/lib/spotify";

export async function GET(req: Request) {
  const token = await sessionAccessToken();
  if (!token) return NextResponse.json({ error: "Nicht mit Spotify angemeldet" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim();
  return NextResponse.json({ tracks: q ? await searchTracks(token, q, 3) : [] });
}
