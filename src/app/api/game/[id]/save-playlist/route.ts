import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { getGame, getHostToken, getSavedPlaylistId, setSavedPlaylist } from "@/lib/game/store";
import { addToPlaylist, createPlaylist } from "@/lib/spotify";

/**
 * Host only: saves the songs of the evening (every game played in this lobby) as a private playlist in the host's
 * Spotify account. Once saved, the songs of later games are added to the same playlist.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/game/[id]/save-playlist">) {
  const { id } = await ctx.params;
  const host = requirePlayer(req, id, { host: true });
  if (typeof host !== "string") return host;
  const game = getGame(id);
  const trackIds = game?.evening?.songs.map(s => s.trackId) ?? [];
  if (!trackIds.length) return NextResponse.json({ error: "Noch keine Songs gespielt" }, { status: 400 });
  const saved = game!.savedPlaylist;
  const playlistId = getSavedPlaylistId(id);
  if (saved && saved.songs >= trackIds.length) return NextResponse.json({ url: saved.url });

  const token = await getHostToken(id);
  if (!token) return NextResponse.json({ error: "Host ist nicht mit Spotify verbunden" }, { status: 401 });
  if (saved && playlistId) {
    const error = await addToPlaylist(token, playlistId, trackIds.slice(saved.songs));
    if (error) return NextResponse.json(error, { status: 502 });
    setSavedPlaylist(id, { id: playlistId, url: saved.url }, trackIds.length);
    return NextResponse.json({ url: saved.url });
  }
  const date = new Date().toLocaleDateString("de-DE", { day: "numeric", month: "numeric", year: "numeric" });
  const result = await createPlaylist(token, `Kennste?! – ${date}`, "Gespielte Songs aus Kennste?!", trackIds);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });
  setSavedPlaylist(id, result, trackIds.length);
  return NextResponse.json({ url: result.url });
}
