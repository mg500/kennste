import { NextResponse } from "next/server";
import { sessionAccessToken } from "@/lib/auth";
import { fetchRecentlyPlayed, searchTracks } from "@/lib/spotify";

/** How many recently played songs the test song suggests. */
const RECENT_SUGGESTIONS = 4;

/** Songs for the test song before a game: search results, or without a query what the user listened to last. */
export async function GET(req: Request) {
  const token = await sessionAccessToken();
  if (!token) return NextResponse.json({ error: "Nicht mit Spotify angemeldet" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (q) return NextResponse.json({ tracks: await searchTracks(token, q, 3) });
  // Signed in before the app asked for the permission: no suggestions until the next sign-in
  const recent = await fetchRecentlyPlayed(token, 20);
  return NextResponse.json({ tracks: recent && "tracks" in recent ? recent.tracks.slice(0, RECENT_SUGGESTIONS) : [] });
}
