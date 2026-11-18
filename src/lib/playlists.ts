import type { Track } from "./game/types";
import { DEVICE_GONE, deviceQuery, sleep, spotifyFetch, toTrack, type SpotifyTrack } from "./spotify";

/** Songs Spotify shows in the playback queue: the current one plus the next 20. */
export const QUEUE_BLOCK = 21;
/**
 * Blocks overlap by one song: the Spotify app on a Mac starts a playlist one song after the requested position
 * (seen with the diagnosis), elsewhere it may start right there — either way no song falls through the gaps.
 */
export const BLOCK_STRIDE = QUEUE_BLOCK - 1;
/** Reads of the queue until it is complete, and the pause between them (see scanPlaylistQueue). */
const QUEUE_READS = 4;
const QUEUE_RETRY_MS = 500;

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

/**
 * The number of songs of a playlist as the search tells it: for a foreign playlist, GET /playlists/{id} leaves it out
 * (seen with the diagnosis, Nov 2026). Found by its name among the first results; 0 if it isn't there.
 */
export async function searchPlaylistLength(token: string, playlistId: string, name: string): Promise<number> {
  const res = await spotifyFetch(token, `/search?q=${encodeURIComponent(name)}&type=playlist&limit=10`).catch(() => null);
  if (!res?.ok) return 0;
  const data = await res.json().catch(() => null) as { playlists?: { items?: (SpotifyPlaylist | null)[] } } | null;
  const found = data?.playlists?.items?.find(p => p?.id === playlistId);
  return found ? toPlaylistInfo(found).trackCount : 0;
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
  const count = Math.max(1, Math.ceil((total - 1) / BLOCK_STRIDE));
  const first = Math.floor(random() * count);
  return Array.from({ length: count }, (_, k) => ((first + k) % count) * BLOCK_STRIDE);
}

/** What plays before the app changes the music, to put it back afterwards. */
export interface PlayerSnapshot {
  is_playing?: boolean;
  shuffle_state?: boolean;
  progress_ms?: number;
  context?: { uri?: string } | null;
  item?: { uri?: string; id?: string; name?: string } | null;
  device?: { id?: string; volume_percent?: number | null } | null;
}

/** Volume to set back after reading quietly, with what it was – or null where it can't be set (or is 0 anyway). */
async function deviceVolume(token: string, deviceId?: string): Promise<number | null> {
  const res = await spotifyFetch(token, "/me/player/devices").catch(() => null);
  if (!res?.ok) return null;
  const { devices } = await res.json().catch(() => ({})) as { devices?: { id: string | null; is_active?: boolean; volume_percent?: number | null; supports_volume?: boolean }[] };
  const device = devices?.find(d => (deviceId ? d.id === deviceId : d.is_active));
  return device && device.supports_volume !== false && device.volume_percent ? device.volume_percent : null;
}

const setVolume = (token: string, percent: number, deviceId?: string) =>
  spotifyFetch(token, `/me/player/volume?volume_percent=${percent}${deviceQuery(deviceId, "&")}`, { method: "PUT" }).catch(() => null);

/** How long to wait for Spotify to report a new volume: 2.3–2.7 s on a Fire TV (diagnosis, Nov 2026). */
const VOLUME_WAIT_MS = 4000;

export async function snapshotPlayer(token: string): Promise<PlayerSnapshot | null> {
  const res = await spotifyFetch(token, "/me/player").catch(() => null);
  return res?.status === 200 ? res.json().catch(() => null) : null;
}

/**
 * Polls the player until `check` holds (or the time is up) and returns the last state. The Spotify apps apply
 * commands like shuffle and report play/pause only a moment after the request succeeded.
 */
export async function waitForPlayer(token: string, check: (p: PlayerSnapshot) => boolean, timeoutMs = 3000): Promise<PlayerSnapshot | null> {
  let state: PlayerSnapshot | null = null;
  for (let waited = 0; ; waited += POLL_MS) {
    state = await snapshotPlayer(token);
    if ((state && check(state)) || waited >= timeoutMs) return state;
    await sleep(POLL_MS);
  }
}
const POLL_MS = 250;

/** Continues what played in the snapshot, at the same spot (nothing if nothing played). */
export async function restorePlayer(token: string, snapshot: PlayerSnapshot | null, deviceId?: string) {
  if (!snapshot?.is_playing || !snapshot.item?.uri) return;
  const position = { position_ms: snapshot.progress_ms ?? 0 };
  const body = snapshot.context?.uri
    ? { context_uri: snapshot.context.uri, offset: { uri: snapshot.item.uri }, ...position }
    : { uris: [snapshot.item.uri], ...position };
  await spotifyFetch(token, `/me/player/play${deviceQuery(deviceId)}`, { method: "PUT", body: JSON.stringify(body) }).catch(() => {});
  // Only done once Spotify reports it: right afterwards it still shows what played before (seen with the diagnosis)
  await waitForPlayer(token, p => !!p.is_playing && p.item?.uri === snapshot.item?.uri);
}

/** Starts a playlist, at a position if given (in shuffle mode the device goes on in its own order). Resolves to a user-facing error. */
export async function playPlaylist(token: string, playlistId: string, position: number | undefined, deviceId?: string): Promise<string | undefined> {
  const res = await spotifyFetch(token, `/me/player/play${deviceQuery(deviceId)}`, {
    method: "PUT",
    body: JSON.stringify({ context_uri: `spotify:playlist:${playlistId}`, ...(position === undefined ? {} : { offset: { position } }) }),
  }).catch(() => null);
  if (!res?.ok) return res?.status === 404 ? DEVICE_GONE : "Playlist konnte nicht gestartet werden";
}

/**
 * Reads songs of any playlist through the playback queue: starts the playlist at each position, reads the
 * queue and pauses. The music on the device briefly changes; shuffle is turned off meanwhile so the queue
 * follows the playlist order. With `restore`, what played before continues afterwards. With `mute`, the device is
 * quiet meanwhile (where its volume can be set). With `settleLater`, it returns as soon as the songs are read;
 * setting the volume and shuffle back (and restoring) finishes with `settled`.
 */
export async function scanPlaylistQueue(
  token: string, playlistId: string, positions: number[],
  opts: { deviceId?: string; total?: number; restore?: boolean; mute?: boolean; settleLater?: boolean } = {},
): Promise<{ tracks: Track[]; reads: number; heard: string[]; settled: Promise<void>; error?: string }> {
  const { deviceId, total } = opts;
  const contextUri = `spotify:playlist:${playlistId}`;
  const before = await snapshotPlayer(token);
  // The device applies shuffle only a moment after the request: wait for it, or the playlist starts shuffled
  const shuffleOff = async () => {
    await spotifyFetch(token, `/me/player/shuffle?state=false${deviceQuery(deviceId, "&")}`, { method: "PUT" }).catch(() => {});
    await waitForPlayer(token, p => p.shuffle_state === false, 2000);
  };
  if (before?.shuffle_state) await shuffleOff();
  // Quiet: Spotify reports the new volume only a few seconds later, and whether the device is quiet before that
  // isn't known – so reading starts once it's reported (or the time is up)
  const volume = opts.mute ? await deviceVolume(token, deviceId) : null;
  const muted = volume !== null && !!(await setVolume(token, 0, deviceId))?.ok;
  if (muted) await waitForPlayer(token, p => p.device?.volume_percent === 0, VOLUME_WAIT_MS);

  const tracks: Track[] = [];
  const seen = new Set<string>();
  /** The song that played for a moment at each start: everyone in the room heard a bit of it. */
  const heard: string[] = [];
  let error: string | undefined;
  /** How often the queue had to be read at most until it was complete. */
  let reads = 0;
  let settled = Promise.resolve();
  try {
    for (const position of positions) {
      const playRes = await spotifyFetch(token, `/me/player/play${deviceQuery(deviceId)}`, {
        method: "PUT",
        body: JSON.stringify({ context_uri: contextUri, offset: { position } }),
      }).catch(() => null);
      if (!playRes) { error = "Spotify nicht erreichbar"; break; }
      if (playRes.status === 404) { error = deviceId ? DEVICE_GONE : "Kein aktives Spotify-Gerät gefunden. Öffne Spotify und spiele kurz etwas ab."; break; }
      if (!playRes.ok) { error = "Playback konnte nicht gestartet werden"; break; }

      // Still shuffling (the device ignored the switch)? Turning it off now puts the queue back in playlist order
      const now = await waitForPlayer(token, p => p.context?.uri === contextUri, 2000);
      if (now?.shuffle_state) await shuffleOff();
      // Wait briefly for the queue to populate, then pause before reading
      await sleep(400);
      await spotifyFetch(token, `/me/player/pause${deviceQuery(deviceId)}`, { method: "PUT" }).catch(() => {});

      // Past the playlist's end the queue continues with other music (autoplay, repeat). Spotify may have started
      // one song late, so at the end one song less is taken — better to miss the last song than to add a stranger
      const limit = total ? Math.max(1, Math.min(QUEUE_BLOCK, total - position - 1)) : QUEUE_BLOCK;
      // The device may hand out only part of the queue at first (seen with the diagnosis on a Pixel: 4 songs
      // instead of 21, the run before all of them): read it again for a moment
      let items: (SpotifyTrack | undefined)[] = [];
      for (let read = 1; read <= QUEUE_READS; read++) {
        if (read > 1) await sleep(QUEUE_RETRY_MS);
        const queueRes = await spotifyFetch(token, "/me/player/queue").catch(() => null);
        if (!queueRes?.ok) { error = "Queue konnte nicht gelesen werden"; break; }
        const queue = await queueRes.json() as { currently_playing?: SpotifyTrack; queue?: SpotifyTrack[] };
        items = [queue.currently_playing, ...(queue.queue ?? [])];
        reads = Math.max(reads, read);
        if (items.filter(Boolean).length >= limit) break;
      }
      if (error) break;
      if (items[0]?.id) heard.push(items[0].id);
      for (const item of items.slice(0, limit)) {
        const t = toTrack(item);
        if (t && !seen.has(t.id)) { seen.add(t.id); tracks.push(t); }
      }
    }
  } finally {
    const shuffleOn = () => spotifyFetch(token, `/me/player/shuffle?state=true${deviceQuery(deviceId, "&")}`, { method: "PUT" }).catch(() => {});
    settled = (async () => {
      if (muted) {
        // Loud again only once the device stopped – never left quiet: asked again if not reported
        await waitForPlayer(token, p => p.is_playing === false, 2000);
        await setVolume(token, volume, deviceId);
        if ((await waitForPlayer(token, p => p.device?.volume_percent === volume, VOLUME_WAIT_MS))?.device?.volume_percent !== volume) {
          await setVolume(token, volume, deviceId);
        }
      }
      if (before?.shuffle_state) {
        await shuffleOn();
        await waitForPlayer(token, p => p.shuffle_state === true, 2000);
      }
      if (opts.restore) {
        await restorePlayer(token, before, deviceId);
        // Restarting the music may reset shuffle on the device (seen once with the diagnosis): switch it on again
        if (before?.shuffle_state && !(await waitForPlayer(token, p => p.shuffle_state === true, 1500))?.shuffle_state) await shuffleOn();
      }
    })().catch(() => {});
    if (!opts.settleLater) await settled;
  }
  return { tracks, reads, heard, settled, ...(tracks.length === 0 && error ? { error } : {}) };
}
