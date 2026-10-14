import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { getGame, getHostToken, setPlaylist } from "@/lib/game/store";
import type { Track } from "@/lib/game/types";
import { spotifyFetch, toTrack, type SpotifyTrack } from "@/lib/spotify";

// Primary: fetch playlist items via the /items endpoint (works for own/collaborative playlists)
async function fetchPlaylistItems(playlistId: string, token: string): Promise<Track[]> {
  const tracks: Track[] = [];
  let nextUrl: string | null = `/playlists/${playlistId}/items?limit=100`;

  while (nextUrl) {
    const res = await spotifyFetch(token, nextUrl);
    if (!res.ok) return tracks; // return whatever we have so far
    const data = await res.json() as {
      items?: { item?: SpotifyTrack; track?: SpotifyTrack }[];
      next?: string | null;
    };
    if (!data.items) return tracks; // items field absent → not owned by user
    for (const entry of data.items) {
      // Support both the new (entry.item) and old (entry.track) format
      const t = toTrack(entry?.item ?? entry?.track);
      if (t) tracks.push(t);
    }
    nextUrl = data.next ?? null;
  }
  return tracks;
}

// Fallback: scan playlist via Spotify playback queue (works for any playlist, but only ~20 tracks)
async function scanPlaylistViaQueue(playlistId: string, token: string): Promise<{ tracks: Track[]; error?: string }> {
  const playRes = await spotifyFetch(token, "/me/player/play", {
    method: "PUT",
    body: JSON.stringify({ context_uri: `spotify:playlist:${playlistId}` }),
  });

  if (playRes.status === 404) return { tracks: [], error: "Kein aktives Spotify-Gerät gefunden. Öffne Spotify und spiele kurz etwas ab." };
  if (!playRes.ok) return { tracks: [], error: "Playback konnte nicht gestartet werden" };

  // Wait briefly for the queue to populate, then pause before reading
  await new Promise(r => setTimeout(r, 300));
  await spotifyFetch(token, "/me/player/pause", { method: "PUT" }).catch(() => {});

  const queueRes = await spotifyFetch(token, "/me/player/queue");
  if (!queueRes.ok) return { tracks: [], error: "Queue konnte nicht gelesen werden" };

  const queue = await queueRes.json() as { currently_playing?: SpotifyTrack; queue?: SpotifyTrack[] };
  const tracks: Track[] = [];
  const seen = new Set<string>();
  for (const item of [queue.currently_playing, ...(queue.queue ?? [])]) {
    const t = toTrack(item);
    if (t && !seen.has(t.id)) { seen.add(t.id); tracks.push(t); }
  }
  return { tracks };
}

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

  let tracks = await fetchPlaylistItems(playlistId, token);
  if (tracks.length === 0) {
    const result = await scanPlaylistViaQueue(playlistId, token);
    tracks = result.tracks;
    if (tracks.length === 0) return NextResponse.json({ error: result.error ?? "Keine Songs gefunden" }, { status: 400 });
  }

  // Shuffle
  for (let i = tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }

  const game = setPlaylist(id, playlistId, tracks);
  if (!game) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });
  return NextResponse.json(game);
}
