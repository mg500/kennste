import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { getGame, getHostToken, setPlaylist } from "@/lib/game/store";
import { fetchPlaylistInfo, fetchPlaylistItems, queueBlocks, scanPlaylistQueue } from "@/lib/playlists";

export async function POST(req: Request, ctx: RouteContext<"/api/game/[id]/playlist">) {
  const { id } = await ctx.params;
  const host = requirePlayer(req, id, { host: true });
  if (typeof host !== "string") return host;
  if (getGame(id)?.status !== "lobby") return NextResponse.json({ error: "Spiel läuft bereits" }, { status: 400 });

  const token = await getHostToken(id);
  if (!token) return NextResponse.json({ error: "Host ist nicht mit Spotify verbunden" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const playlistId = typeof body?.playlistId === "string" && /^[A-Za-z0-9]{1,64}$/.test(body.playlistId) ? body.playlistId : null;
  if (!playlistId) return NextResponse.json({ error: "Ungültige Playlist" }, { status: 400 });

  const info = await fetchPlaylistInfo(token, playlistId);
  const named = { id: playlistId, name: info?.name ?? "Playlist", image: info?.image ?? null };

  // Own and collaborative playlists: all songs at once
  const items = await fetchPlaylistItems(token, playlistId);
  if (items.length > 0) {
    const game = setPlaylist(id, named, items);
    return game ? NextResponse.json(game) : NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });
  }

  // Any other playlist: the first block through the playback queue now, more as the game needs them
  const total = info?.trackCount || undefined;
  const [first, ...blocks] = queueBlocks(total ?? 0, Math.random);
  const result = await scanPlaylistQueue(token, playlistId, [first], { deviceId: getGame(id)?.device?.id, total, restore: true });
  if (result.tracks.length === 0) return NextResponse.json({ error: result.error ?? "Keine Songs gefunden" }, { status: 400 });

  const game = setPlaylist(id, named, result.tracks, total ? { playlistId, total, blocks } : undefined);
  if (!game) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });
  return NextResponse.json(game);
}
