import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { cancelLobbyHandoff, getGame, getHostToken, playlistSettled, refreshPlayback } from "@/lib/game/store";
import { playPlaylist } from "@/lib/playlists";
import { runEffect } from "@/lib/spotify";

const ID = /^[A-Za-z0-9]{1,64}$/;

/**
 * Music in the lobby, before the game starts (host only): play a song or a playlist, pause, resume.
 * Body: { trackId } | { playlistId } | { pause: true } | { resume: true }
 */
export async function POST(req: Request, ctx: RouteContext<"/api/game/[id]/music">) {
  const { id } = await ctx.params;
  const host = requirePlayer(req, id, { host: true });
  if (typeof host !== "string") return host;
  const game = getGame(id);
  if (game?.status !== "lobby") return NextResponse.json({ error: "Nur in der Lobby" }, { status: 400 });

  const token = await getHostToken(id);
  if (!token) return NextResponse.json({ error: "Host ist nicht mit Spotify verbunden" }, { status: 401 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const deviceId = game.device?.id;
  await playlistSettled(id); // a playlist just picked has started playing on: this comes after it
  cancelLobbyHandoff(id);
  let error: string | undefined;
  if (typeof body?.trackId === "string" && ID.test(body.trackId)) {
    error = await runEffect(token, { type: "play", trackId: body.trackId }, deviceId);
  } else if (typeof body?.playlistId === "string" && ID.test(body.playlistId)) {
    error = await playPlaylist(token, body.playlistId, undefined, deviceId);
  } else if (body?.pause === true) {
    error = await runEffect(token, { type: "pause" }, deviceId);
  } else if (body?.resume === true) {
    error = await runEffect(token, { type: "play" }, deviceId);
  } else {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  refreshPlayback(id);
  return error ? NextResponse.json({ error }, { status: 502 }) : NextResponse.json({ ok: true });
}
