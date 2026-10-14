import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGame, getHostToken, setPlaylist, PlaylistTrack } from "@/lib/games";

function extractPlaylistId(input: string): string | null {
  const urlMatch = input.match(/playlist\/([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9]{22}$/.test(input.trim())) return input.trim();
  return null;
}

function parseTrack(item: Record<string, unknown>): PlaylistTrack | null {
  // Support both old format (item.track) and new format (item.item)
  const t = (item?.item ?? item?.track) as {
    id?: string; name?: string; preview_url?: string | null;
    artists?: { name: string }[];
    album?: { name?: string; images?: { url: string }[]; release_date?: string };
  } | undefined;
  if (!t?.id || !t?.name) return null;
  return {
    id: t.id,
    name: t.name,
    artist: t.artists?.map(a => a.name).join(", ") ?? "",
    album: t.album?.name,
    releaseYear: t.album?.release_date?.slice(0, 4),
    albumArt: t.album?.images?.[0]?.url ?? null,
    previewUrl: t.preview_url ?? null,
  };
}

function parseQueueTrack(t: Record<string, unknown>): PlaylistTrack | null {
  const track = t as {
    id?: string; name?: string; preview_url?: string | null;
    artists?: { name: string }[];
    album?: { name?: string; images?: { url: string }[]; release_date?: string };
  };
  if (!track?.id || !track?.name) return null;
  return {
    id: track.id,
    name: track.name,
    artist: track.artists?.map(a => a.name).join(", ") ?? "",
    album: track.album?.name,
    releaseYear: track.album?.release_date?.slice(0, 4),
    albumArt: track.album?.images?.[0]?.url ?? null,
    previewUrl: track.preview_url ?? null,
  };
}

// Primary: fetch playlist items via the new /items endpoint (works for own/collaborative playlists)
async function fetchPlaylistItems(playlistId: string, token: string): Promise<PlaylistTrack[]> {
  const tracks: PlaylistTrack[] = [];
  let nextUrl: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100`;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return tracks; // return whatever we have so far
    const data = await res.json() as {
      items?: Record<string, unknown>[];
      next?: string | null;
    };
    if (!data.items) return tracks; // items field absent → not owned by user
    for (const item of data.items) {
      const t = parseTrack(item);
      if (t) tracks.push(t);
    }
    nextUrl = data.next ?? null;
  }
  return tracks;
}

// Fallback: scan playlist via Spotify playback queue (works for any playlist)
async function scanPlaylistViaQueue(playlistId: string, token: string): Promise<{ tracks: PlaylistTrack[]; error?: string }> {
  const playRes = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ context_uri: `spotify:playlist:${playlistId}` }),
  });

  if (playRes.status === 404) return { tracks: [], error: "Kein aktives Spotify-Gerät gefunden. Öffne Spotify und spiele kurz etwas ab." };
  if (!playRes.ok && playRes.status !== 204) return { tracks: [], error: "Playback konnte nicht gestartet werden" };

  // Wait briefly for the queue to populate, then pause before reading
  await new Promise(r => setTimeout(r, 300));

  await fetch("https://api.spotify.com/v1/me/player/pause", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});

  const queueRes = await fetch("https://api.spotify.com/v1/me/player/queue", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!queueRes.ok) return { tracks: [], error: "Queue konnte nicht gelesen werden" };

  const queue = await queueRes.json() as {
    currently_playing?: Record<string, unknown>;
    queue?: Record<string, unknown>[];
  };

  const tracks: PlaylistTrack[] = [];
  const seen = new Set<string>();

  if (queue.currently_playing) {
    const t = parseQueueTrack(queue.currently_playing);
    if (t && !seen.has(t.id)) { seen.add(t.id); tracks.push(t); }
  }
  for (const item of queue.queue ?? []) {
    const t = parseQueueTrack(item);
    if (t && !seen.has(t.id)) { seen.add(t.id); tracks.push(t); }
  }

  return { tracks };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const game = getGame(id);
  if (!game) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });

  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? (await getHostToken(id));
  if (!token) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { playlistUrl } = await req.json();
  const playlistId = extractPlaylistId(playlistUrl ?? "");
  if (!playlistId) return NextResponse.json({ error: "Ungültige Playlist-URL" }, { status: 400 });

  // 1) Try the new /items endpoint (works for own/collaborative playlists)
  let tracks = await fetchPlaylistItems(playlistId, token);

  // 2) Fallback: scan via queue (works for any playlist, needs active device)
  if (tracks.length === 0) {
    const result = await scanPlaylistViaQueue(playlistId, token);
    tracks = result.tracks;
    if (tracks.length === 0) {
      return NextResponse.json(
        { error: result.error ?? "Keine Songs gefunden" },
        { status: 400 },
      );
    }
  }

  // Shuffle
  for (let i = tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }

  const updatedGame = setPlaylist(id, playlistId, tracks);
  if (!updatedGame) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });

  return NextResponse.json(updatedGame);
}
