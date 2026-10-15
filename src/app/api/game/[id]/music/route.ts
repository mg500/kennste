import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { getGame, getHostToken, refreshPlayback } from "@/lib/game/store";
import { deviceQuery, DEVICE_GONE, runEffect, spotifyFetch } from "@/lib/spotify";

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
  let error: string | undefined;
  if (typeof body?.trackId === "string" && ID.test(body.trackId)) {
    error = await runEffect(token, { type: "play", trackId: body.trackId }, deviceId);
  } else if (typeof body?.playlistId === "string" && ID.test(body.playlistId)) {
    const res = await spotifyFetch(token, `/me/player/play${deviceQuery(deviceId)}`, {
      method: "PUT", body: JSON.stringify({ context_uri: `spotify:playlist:${body.playlistId}` }),
    }).catch(() => null);
    if (!res?.ok) error = res?.status === 404 ? DEVICE_GONE : "Playlist konnte nicht gestartet werden";
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
