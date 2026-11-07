import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { cancelLobbyHandoff, gameView, getGame, getHostToken, refreshPlayback, setPlaylist } from "@/lib/game/store";
import { logEvent } from "@/lib/log";
import { fetchPlaylistInfo, fetchPlaylistItems, playPlaylist, queueBlocks, scanPlaylistQueue } from "@/lib/playlists";
import { runEffect } from "@/lib/spotify";

export async function POST(req: Request, ctx: RouteContext<"/api/game/[id]/playlist">) {
  const { id } = await ctx.params;
  const host = requirePlayer(req, id, { host: true });
  if (typeof host !== "string") return host;
  const status = getGame(id)?.status;
  if (!status) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });
  // Only in the lobby: the playlist is picked before the game
  if (status !== "lobby") return NextResponse.json({ error: "Die Playlist lässt sich nur in der Lobby wählen" }, { status: 400 });

  const token = await getHostToken(id);
  if (!token) return NextResponse.json({ error: "Host ist nicht mit Spotify verbunden" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const playlistId = typeof body?.playlistId === "string" && /^[A-Za-z0-9]{1,64}$/.test(body.playlistId) ? body.playlistId : null;
  if (!playlistId) return NextResponse.json({ error: "Ungültige Playlist" }, { status: 400 });

  cancelLobbyHandoff(id); // the new playlist plays now
  const info = await fetchPlaylistInfo(token, playlistId);
  const named = { id: playlistId, name: info?.name ?? "Playlist", image: info?.image ?? null };

  // Own and collaborative playlists: all songs at once
  const items = await fetchPlaylistItems(token, playlistId);

  // The picked playlist plays on in the lobby right away (the songs heard there come last in the game, see heardLast)
  const deviceId = getGame(id)?.device?.id;
  if (items.length > 0) {
    const game = setPlaylist(id, named, items);
    const error = await playPlaylist(token, playlistId, Math.floor(Math.random() * items.length), deviceId);
    if (error) logEvent("playlistPlayOn", { game: id, error, own: true });
    refreshPlayback(id);
    return game ? NextResponse.json(gameView(id, host)) : NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });
  }

  // Any other playlist: the first block through the playback queue now, more as the game needs them. Then it plays
  // on: from the block read last, or – a short playlist, or one whose length Spotify doesn't tell – right where reading
  // it stopped (those songs come last in the game then)
  const total = info?.trackCount || undefined;
  const [first, ...blocks] = queueBlocks(total ?? 0, Math.random);
  const result = await scanPlaylistQueue(token, playlistId, [first], { deviceId, total });
  if (result.tracks.length) {
    const error = blocks.length
      ? await playPlaylist(token, playlistId, blocks.at(-1), deviceId)
      : await runEffect(token, { type: "play" }, deviceId);
    if (error) logEvent("playlistPlayOn", { game: id, error, total: total ?? null });
  }
  refreshPlayback(id);
  if (result.tracks.length === 0) return NextResponse.json({ error: result.error ?? "Keine Songs gefunden" }, { status: 400 });

  const game = setPlaylist(id, named, result.tracks, total ? { playlistId, total, blocks } : undefined, result.heard);
  if (!game) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });
  return NextResponse.json(gameView(id, host));
}
