import type { Track } from "./game/types";
import { DEVICE_GONE, deviceQuery, spotifyFetch, toTrack, type SpotifyTrack } from "./spotify";

/** Songs Spotify shows in the playback queue: the current one plus the next 20. */
export const QUEUE_BLOCK = 21;

export interface PlaylistInfo {
  id: string;
  name: string;
  image: string | null;
  owner: string;
  /** Number of songs, if Spotify tells. */
  trackCount: number;
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  images?: { url: string }[] | null;
  items?: { total: number };
  tracks?: { total: number };
  owner?: { display_name?: string };
}

export function toPlaylistInfo(p: SpotifyPlaylist): PlaylistInfo {
  return {
    id: p.id,
    name: p.name,
    image: p.images?.[0]?.url ?? null,
    // Feb 2026 API: playlist "tracks" renamed to "items"
    trackCount: p.items?.total ?? p.tracks?.total ?? 0,
    owner: p.owner?.display_name ?? "",
  };
}

/** Playlist ID from a pasted Spotify link (open.spotify.com/…/playlist/<id>) or URI (spotify:playlist:<id>). */
export function parsePlaylistLink(text: string): string | null {
  return text.trim().match(/(?:playlist[/:])([A-Za-z0-9]{22})/)?.[1] ?? null;
}

export async function fetchPlaylistInfo(token: string, playlistId: string): Promise<PlaylistInfo | null> {
  const res = await spotifyFetch(token, `/playlists/${playlistId}`).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => null) as SpotifyPlaylist | null;
  return data?.id && data.name ? toPlaylistInfo(data) : null;
}

/** All songs via the /items endpoint — only works for the host's own and collaborative playlists. */
export async function fetchPlaylistItems(token: string, playlistId: string): Promise<Track[]> {
  const tracks: Track[] = [];
  let nextUrl: string | null = `/playlists/${playlistId}/items?limit=100`;
  while (nextUrl) {
    const res = await spotifyFetch(token, nextUrl).catch(() => null);
    if (!res?.ok) return tracks; // return whatever we have so far
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

/**
 * Start positions of the queue blocks covering a playlist of `total` songs, beginning at a random block
 * so that not every game starts with the same songs. Unknown size → just the first block.
 */
export function queueBlocks(total: number, random: () => number): number[] {
  if (total <= 0) return [0];
  const count = Math.ceil(total / QUEUE_BLOCK);
  const first = Math.floor(random() * count);
  return Array.from({ length: count }, (_, k) => ((first + k) % count) * QUEUE_BLOCK);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Reads songs of any playlist through the playback queue: starts the playlist at each position, reads the
 * queue and pauses. The music on the device briefly changes; shuffle is turned off meanwhile so the queue
 * follows the playlist order. With `restore`, what played before continues afterwards.
 */
export async function scanPlaylistQueue(
  token: string, playlistId: string, positions: number[],
  opts: { deviceId?: string; total?: number; restore?: boolean } = {},
): Promise<{ tracks: Track[]; error?: string }> {
  const { deviceId, total } = opts;
  const before = await spotifyFetch(token, "/me/player").then(r => (r.status === 200 ? r.json() : null)).catch(() => null) as
    { is_playing?: boolean; shuffle_state?: boolean; progress_ms?: number; context?: { uri?: string } | null; item?: { uri?: string } | null } | null;
  if (before?.shuffle_state) {
    await spotifyFetch(token, `/me/player/shuffle?state=false${deviceQuery(deviceId, "&")}`, { method: "PUT" }).catch(() => {});
  }

  const tracks: Track[] = [];
  const seen = new Set<string>();
  let error: string | undefined;
  try {
    for (const position of positions) {
      const playRes = await spotifyFetch(token, `/me/player/play${deviceQuery(deviceId)}`, {
        method: "PUT",
        body: JSON.stringify({ context_uri: `spotify:playlist:${playlistId}`, offset: { position } }),
      }).catch(() => null);
      if (!playRes) { error = "Spotify nicht erreichbar"; break; }
      if (playRes.status === 404) { error = deviceId ? DEVICE_GONE : "Kein aktives Spotify-Gerät gefunden. Öffne Spotify und spiele kurz etwas ab."; break; }
      if (!playRes.ok) { error = "Playback konnte nicht gestartet werden"; break; }

      // Wait briefly for the queue to populate, then pause before reading
      await sleep(400);
      await spotifyFetch(token, `/me/player/pause${deviceQuery(deviceId)}`, { method: "PUT" }).catch(() => {});

      const queueRes = await spotifyFetch(token, "/me/player/queue").catch(() => null);
      if (!queueRes?.ok) { error = "Queue konnte nicht gelesen werden"; break; }
      const queue = await queueRes.json() as { currently_playing?: SpotifyTrack; queue?: SpotifyTrack[] };
      // Past the playlist's end the queue continues with other music (autoplay, repeat)
      const limit = total ? Math.min(QUEUE_BLOCK, total - position) : QUEUE_BLOCK;
      for (const item of [queue.currently_playing, ...(queue.queue ?? [])].slice(0, limit)) {
        const t = toTrack(item);
        if (t && !seen.has(t.id)) { seen.add(t.id); tracks.push(t); }
      }
    }
  } finally {
    if (before?.shuffle_state) {
      await spotifyFetch(token, `/me/player/shuffle?state=true${deviceQuery(deviceId, "&")}`, { method: "PUT" }).catch(() => {});
    }
    if (opts.restore && before?.is_playing && before.item?.uri) {
      const body = before.context?.uri
        ? { context_uri: before.context.uri, offset: { uri: before.item.uri }, position_ms: before.progress_ms ?? 0 }
        : { uris: [before.item.uri], position_ms: before.progress_ms ?? 0 };
      await spotifyFetch(token, `/me/player/play${deviceQuery(deviceId)}`, { method: "PUT", body: JSON.stringify(body) }).catch(() => {});
    }
  }
  return { tracks, ...(tracks.length === 0 && error ? { error } : {}) };
}
