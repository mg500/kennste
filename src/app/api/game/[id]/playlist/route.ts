import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { cancelLobbyHandoff, gameView, getGame, getHostToken, pickPlaylist, playlistFailed, playlistSettled, refreshPlayback, setPlaylist, settlePlaylist } from "@/lib/game/store";
import { logEvent } from "@/lib/log";
import { fetchPlaylistInfo, fetchPlaylistItems, queueBlocks, scanPlaylistQueue, searchPlaylistLength } from "@/lib/playlists";

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

  await playlistSettled(id); // the playlist picked before is read
  cancelLobbyHandoff(id); // after a game, the old playlist doesn't take over anymore
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

/**
 * Reads the picked playlist's songs. The lobby's music stays as it was: the playlist's songs start with the game.
 * Returns why no songs came of it.
 */
async function readPlaylist(
  id: string, token: string, named: { id: string; name: string; image: string | null },
  info: Awaited<ReturnType<typeof fetchPlaylistInfo>>, told: number | undefined,
): Promise<string | undefined> {
  const playlistId = named.id;
  // Own and collaborative playlists: all songs at once, the music isn't touched
  const items = await fetchPlaylistItems(token, playlistId);
  if (items.length > 0) {
    setPlaylist(id, named, items);
    return;
  }

  // Any other playlist: the first block through the playback queue now, more as the game needs them; then what
  // played before goes on (nothing if nothing played). Spotify tells a foreign playlist's length only in the search:
  // as the picked search result said, or – a pasted link – looked up there. Unknown, just one block can be read (past
  // its end Spotify plays some other song, seen with the diagnosis).
  const deviceId = getGame(id)?.device?.id;
  const total = info?.trackCount || told || (info ? await searchPlaylistLength(token, playlistId, info.name) : 0) || undefined;
  const [first, ...blocks] = queueBlocks(total ?? 0, Math.random);
  const result = await scanPlaylistQueue(token, playlistId, [first], { deviceId, total, restore: true, settleLater: true });
  if (result.tracks.length > 0) setPlaylist(id, named, result.tracks, total ? { playlistId, total, blocks } : undefined, result.heard);
  // Shuffle back on and the music before (the start still waits for it)
  await result.settled;
  refreshPlayback(id);
  if (result.tracks.length === 0) return result.error ?? "Keine Songs gefunden";
}
