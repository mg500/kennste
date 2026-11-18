import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { cancelLobbyHandoff, gameView, getGame, getHostToken, pickPlaylist, playlistFailed, playlistSettled, refreshPlayback, setPlaylist, settlePlaylist } from "@/lib/game/store";
import { logEvent } from "@/lib/log";
import { fetchPlaylistInfo, fetchPlaylistItems, playPlaylist, queueBlocks, scanPlaylistQueue, searchPlaylistLength } from "@/lib/playlists";
import { runEffect } from "@/lib/spotify";

/** Spotify playlists hold at most 10,000 songs. */
const MAX_TRACKS = 10_000;

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

  await playlistSettled(id); // the playlist picked before has finished playing on
  cancelLobbyHandoff(id); // the new playlist plays now
  const info = await fetchPlaylistInfo(token, playlistId);
  const named = { id: playlistId, name: info?.name ?? "Playlist", image: info?.image ?? null };
  const told = Number.isInteger(body.trackCount) && body.trackCount > 0 && body.trackCount <= MAX_TRACKS ? body.trackCount as number : undefined;

  // Everyone sees the playlist as picked right away; its songs are read meanwhile (the start waits for them)
  const previous = pickPlaylist(id, named);
  if (!previous) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });
  settlePlaylist(id, readPlaylist(id, token, named, info, told).catch(error => {
    logEvent("playlistRead", { game: id, error: String(error) });
    return "Playlist konnte nicht gelesen werden";
  }).then(error => {
    if (error) playlistFailed(id, previous, error);
  }));
  return NextResponse.json(gameView(id, host));
}

/** Reads the picked playlist's songs and lets it play on in the lobby. Returns why no songs came of it. */
async function readPlaylist(
  id: string, token: string, named: { id: string; name: string; image: string | null },
  info: Awaited<ReturnType<typeof fetchPlaylistInfo>>, told: number | undefined,
): Promise<string | undefined> {
  const playlistId = named.id;
  // Own and collaborative playlists: all songs at once
  const items = await fetchPlaylistItems(token, playlistId);

  // The picked playlist plays on in the lobby right away (the songs heard there come last in the game, see heardLast)
  const deviceId = getGame(id)?.device?.id;
  if (items.length > 0) {
    setPlaylist(id, named, items);
    const error = await playPlaylist(token, playlistId, Math.floor(Math.random() * items.length), deviceId);
    if (error) logEvent("playlistPlayOn", { game: id, error, own: true });
    refreshPlayback(id);
    return;
  }

  // Any other playlist: the first block through the playback queue now, more as the game needs them. Then it plays
  // on: from the block read last, or – a short playlist, or one whose length Spotify doesn't tell – right where reading
  // it stopped (those songs come last in the game then). Spotify tells a foreign playlist's length only in the search:
  // as the picked search result said, or – a pasted link – looked up there. Unknown, just one block can be read (past
  // its end Spotify plays some other song, seen with the diagnosis).
  const total = info?.trackCount || told || (info ? await searchPlaylistLength(token, playlistId, info.name) : 0) || undefined;
  const [first, ...blocks] = queueBlocks(total ?? 0, Math.random);
  const result = await scanPlaylistQueue(token, playlistId, [first], { deviceId, total, settleLater: true });
  if (result.tracks.length === 0) {
    await result.settled;
    refreshPlayback(id);
    return result.error ?? "Keine Songs gefunden";
  }

  // The songs count as soon as they are read; shuffle back on and playing on follow (the start still waits for them)
  setPlaylist(id, named, result.tracks, total ? { playlistId, total, blocks } : undefined, result.heard);
  await result.settled;
  const error = blocks.length
    ? await playPlaylist(token, playlistId, blocks.at(-1), deviceId)
    : await runEffect(token, { type: "play" }, deviceId);
  if (error) logEvent("playlistPlayOn", { game: id, error, total: total ?? null });
  refreshPlayback(id);
}
