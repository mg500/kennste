import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { getGame, getHostToken, setSavedPlaylist } from "@/lib/game/store";
import { getMode } from "@/lib/game/modes";
import { createPlaylist } from "@/lib/spotify";

/** After the game (host only): saves every song of it as a private playlist in the host's Spotify account. */
export async function POST(req: Request, ctx: RouteContext<"/api/game/[id]/save-playlist">) {
  const { id } = await ctx.params;
  const host = requirePlayer(req, id, { host: true });
  if (typeof host !== "string") return host;
  const game = getGame(id);
  if (game?.status !== "finished") return NextResponse.json({ error: "Erst nach dem Spiel" }, { status: 400 });
  if (game.savedPlaylist) return NextResponse.json({ url: game.savedPlaylist.url });
  const trackIds = [...new Set((game.history ?? []).map(r => r.song.trackId))];
  if (!trackIds.length) return NextResponse.json({ error: "Keine Songs gespielt" }, { status: 400 });

  const token = await getHostToken(id);
  if (!token) return NextResponse.json({ error: "Host ist nicht mit Spotify verbunden" }, { status: 401 });
  const date = new Date().toLocaleDateString("de-DE", { day: "numeric", month: "numeric", year: "numeric" });
  const result = await createPlaylist(token, `Kennste?! – ${date}`, `${trackIds.length} Songs aus ${getMode(game.mode.id).name}, gespielt mit Kennste?!`, trackIds);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });
  setSavedPlaylist(id, result.url);
  return NextResponse.json({ url: result.url });
}
