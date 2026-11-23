import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import {
  cancelLobbyHandoff, freshAmong, gameView, getGame, getHostToken, pickCurrent, pickPlaylist, playlistFailed, preparePlaylist,
  refreshPlayback, setPlaylist, settlePlaylist, SONGS_AT_START, type Picking,
} from "@/lib/game/store";
import { logEvent, stopwatch } from "@/lib/log";
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

  cancelLobbyHandoff(id); // after a game, the old playlist doesn't take over anymore
  const info = await fetchPlaylistInfo(token, playlistId);
  const named = { id: playlistId, name: info?.name ?? "Playlist", image: info?.image ?? null };
  const told = Number.isInteger(body.trackCount) && body.trackCount > 0 && body.trackCount <= MAX_TRACKS ? body.trackCount as number : undefined;

  // Everyone sees the playlist as picked right away – also while one picked before is still read, which stops after
  // its current block. Its songs are read once the music before is back, then the start is prepared (it's locked
  // until then)
  const picking = pickPlaylist(id, named);
  if (!picking) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });
  settlePlaylist(id, () => readPlaylist(id, token, named, info, told, picking).catch(error => {
    logEvent("playlistRead", { game: id, error: String(error) });
    playlistFailed(id, picking, "Playlist konnte nicht gelesen werden");
    return {};
  }));
  void preparePlaylist(id);
  return NextResponse.json(gameView(id, host));
}

/**
 * Reads the picked playlist's songs. The lobby's music stays as it was: the playlist's songs start with the game.
 * Returns once the songs are there; `settled` once shuffle and the music before are back.
 */
async function readPlaylist(
  id: string, token: string, named: { id: string; name: string; image: string | null },
  info: Awaited<ReturnType<typeof fetchPlaylistInfo>>, told: number | undefined, picking: Picking,
): Promise<{ settled?: Promise<void> }> {
  const playlistId = named.id;
  const cancelled = () => !pickCurrent(id, picking);
  if (cancelled()) return {};
  // How long the steps take on a real device
  const watch = stopwatch();
  const log = (fields: Record<string, unknown>) => logEvent("playlistRead", { game: id, ...fields, ms: watch.ms, totalMs: watch.total() });

  // Own and collaborative playlists: all songs at once, the music isn't touched
  const items = await watch.time("items", () => fetchPlaylistItems(token, playlistId));
  if (items.length > 0) {
    setPlaylist(id, named, items, undefined, [], picking);
    log({ own: true, songs: items.length });
    return {};
  }
  if (cancelled()) return {};

  // Any other playlist: blocks through the playback queue – in one go, so the music changes only once: two, usually
  // enough for the start, more if the host's earlier games played their songs; more as the game needs them. Then
  // what played before goes on (nothing if nothing played). Spotify tells a foreign playlist's length only in the
  // search: as the picked search result said, or – a pasted link – looked up there. Unknown, just one block can be read
  // (past its end Spotify plays some other song, seen with the diagnosis).
  const deviceId = getGame(id)?.device?.id;
  const total = info?.trackCount || told
    || (info ? await watch.time("length", () => searchPlaylistLength(token, playlistId, info.name)) : 0) || undefined;
  const blocks = queueBlocks(total ?? 0, Math.random);
  const result = await watch.time("queue", () => scanPlaylistQueue(token, playlistId, blocks.splice(0, 2), {
    deviceId, total, restore: true, settleLater: true, cancelled,
    more: tracks => (freshAmong(id, tracks) < SONGS_AT_START ? blocks.shift() : undefined),
  }));
  if (result.tracks.length > 0) setPlaylist(id, named, result.tracks, total ? { playlistId, total, blocks } : undefined, result.heard, picking);
  else if (!cancelled()) playlistFailed(id, picking, result.error ?? "Keine Songs gefunden");
  // Shuffle back on and the music before: the start still waits for it
  const settled = watch.time("settle", () => result.settled).then(() => {
    refreshPlayback(id);
    log({
      own: false, songs: result.tracks.length, blocks: result.blocks.length, total: total ?? null, ...(cancelled() ? { cancelled: true } : {}),
      perBlock: result.blocks,
    });
  });
  return { settled };
}
