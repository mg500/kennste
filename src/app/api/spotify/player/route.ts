import { NextResponse } from "next/server";
import { sessionAccessToken } from "@/lib/auth";
import { fetchDevices, fetchPlayerState } from "@/lib/spotify";

/** What plays where, plus the user's Spotify Connect devices — for setting up the music before a game. */
export async function GET() {
  const token = await sessionAccessToken();
  if (!token) return NextResponse.json({ error: "Nicht mit Spotify angemeldet" }, { status: 401 });
  const [player, devices] = await Promise.all([fetchPlayerState(token), fetchDevices(token)]);
  if (!player || !devices) return NextResponse.json({ error: "Spotify nicht erreichbar" }, { status: 502 });
  return NextResponse.json({ player, devices });
}
