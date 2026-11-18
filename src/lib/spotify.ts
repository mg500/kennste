import type { Effect, Playback, Track } from "./game/types";
import { normalizeTitle } from "./releaseYear";

/** Spotify Web API — another address only for end-to-end tests against the simulator (`e2e/`). */
export const API = process.env.SPOTIFY_API_URL ?? "https://api.spotify.com/v1";

export interface SpotifyTrack {
  id?: string;
  name?: string;
  preview_url?: string | null;
  artists?: { name: string }[];
  duration_ms?: number;
  album?: { name?: string; images?: { url: string }[]; release_date?: string };
  external_ids?: { isrc?: string };
}

export function toTrack(t: SpotifyTrack | null | undefined): Track | null {
  if (!t?.id || !t.name) return null;
  return {
    id: t.id,
    name: t.name,
    artist: t.artists?.map(a => a.name).join(", ") ?? "",
    album: t.album?.name,
    releaseYear: t.album?.release_date?.slice(0, 4),
    albumArt: t.album?.images?.[0]?.url ?? null,
    previewUrl: t.preview_url ?? null,
    durationMs: t.duration_ms,
    isrc: t.external_ids?.isrc,
  };
}

export function spotifyFetch(token: string, path: string, init: RequestInit = {}) {
  return fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
}

export async function searchTracks(token: string, q: string, limit = 8, offset = 0): Promise<Track[]> {
  const res = await spotifyFetch(token, `/search?q=${encodeURIComponent(q)}&type=track&limit=${limit}&offset=${offset}`);
  if (!res.ok) return [];
  const data = await res.json() as { tracks?: { items?: SpotifyTrack[] } };
  return (data.tracks?.items ?? []).map(toTrack).filter((t): t is Track => t !== null);
}

/**
 * The songs the user listened to last, newest first and each only once – null if Spotify refused (403: signed in
 * before the app asked for `user-read-recently-played`).
 */
export async function fetchRecentlyPlayed(token: string, limit = 20): Promise<{ tracks: Track[] } | { status: number } | null> {
  const res = await spotifyFetch(token, `/me/player/recently-played?limit=${limit}`).catch(() => null);
  if (!res) return null;
  if (!res.ok) return { status: res.status };
  const data = await res.json().catch(() => null) as { items?: { track?: SpotifyTrack }[] } | null;
  const tracks = (data?.items ?? []).map(i => toTrack(i.track)).filter((t): t is Track => t !== null);
  return { tracks: tracks.filter((t, i) => tracks.findIndex(u => u.id === t.id) === i) };
}

/** The host's playback; `expectedId` maps another version of that track (see sameTrack) to its ID. */
export async function fetchPlayback(token: string, expectedId?: string | null): Promise<Playback | null> {
  const res = await spotifyFetch(token, "/me/player").catch(() => null);
  if (!res) return null;
  if (res.status === 204) return { trackId: null, isPlaying: false, progressMs: 0, durationMs: 0 };
  if (!res.ok) return null;
  const data = await res.json();
  // linked_from holds the requested ID when Spotify relinked the track for the user's market
  const trackId: string | null = data.item?.linked_from?.id ?? data.item?.id ?? null;
  return {
    trackId: expectedId && trackId && sameTrack(expectedId, trackId, data.item?.name) ? expectedId : trackId,
    isPlaying: data.is_playing ?? false,
    progressMs: data.progress_ms ?? 0,
    durationMs: data.item?.duration_ms ?? 0,
  };
}

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  /** Spotify does not allow controlling restricted devices via the Web API. */
  isRestricted: boolean;
}

/** Lists the host's available Spotify Connect devices, or null if Spotify could not be reached. */
export async function fetchDevices(token: string): Promise<SpotifyDevice[] | null> {
  const res = await spotifyFetch(token, "/me/player/devices").catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json() as { devices?: { id: string | null; name: string; type: string; is_active?: boolean; is_restricted?: boolean }[] };
  return (data.devices ?? [])
    .filter(d => d.id)
    .map(d => ({ id: d.id!, name: d.name, type: d.type, isActive: !!d.is_active, isRestricted: !!d.is_restricted }));
}

export interface PlayerState {
  isPlaying: boolean;
  track: Track | null;
  progressMs: number;
  device: SpotifyDevice | null;
}

/** What plays where right now (null if Spotify could not be reached); used before a game exists. */
export async function fetchPlayerState(token: string): Promise<PlayerState | null> {
  const res = await spotifyFetch(token, "/me/player").catch(() => null);
  if (!res) return null;
  if (res.status === 204) return { isPlaying: false, track: null, progressMs: 0, device: null };
  if (!res.ok) return null;
  const data = await res.json();
  const d = data.device;
  return {
    isPlaying: data.is_playing ?? false,
    // linked_from holds the requested ID when Spotify relinked the track for the user's market
    track: toTrack(data.item && { ...data.item, id: data.item.linked_from?.id ?? data.item.id }),
    progressMs: data.progress_ms ?? 0,
    device: d?.id ? { id: d.id, name: d.name, type: d.type, isActive: !!d.is_active, isRestricted: !!d.is_restricted } : null,
  };
}

interface TrackRef { name: string; albumUri?: string }
const trackRefs = new Map<string, TrackRef>();

/** Name and album of a track (cached), needed to start it via its album. */
async function trackRef(token: string, trackId: string): Promise<TrackRef | undefined> {
  const cached = trackRefs.get(trackId);
  if (cached) return cached;
  const res = await spotifyFetch(token, `/tracks/${trackId}`).catch(() => null);
  if (!res?.ok) return undefined;
  const data = await res.json().catch(() => null) as (SpotifyTrack & { album?: { uri?: string } }) | null;
  if (!data?.name) return undefined;
  const ref = { name: data.name, albumUri: data.album?.uri };
  trackRefs.set(trackId, ref);
  if (trackRefs.size > 500) trackRefs.delete(trackRefs.keys().next().value!);
  return ref;
}

/**
 * Whether the playing track counts as the requested one. Spotify apps started via the album may play another
 * version (e.g. "Don't Stop Me Now" instead of "Don't Stop Me Now - Remastered 2011").
 */
export function sameTrack(requestedId: string, playingId: string, playingName?: string): boolean {
  if (requestedId === playingId) return true;
  const name = trackRefs.get(requestedId)?.name;
  return !!name && !!playingName && normalizeTitle(name) === normalizeTitle(playingName);
}

export const DEVICE_GONE = "Wiedergabegerät nicht erreichbar – im Menü ein anderes wählen";

/** Spotify's reason for a failed player request (e.g. "Restriction violated"), logged for debugging. */
async function errorReason(res: Response, what: string): Promise<string | undefined> {
  const body = await res.json().catch(() => null) as { error?: { message?: string; reason?: string } } | null;
  const reason = body?.error?.reason ?? body?.error?.message;
  console.warn(`Spotify: ${what} fehlgeschlagen (${res.status}${reason ? `, ${reason}` : ""})`);
  return reason;
}

const withReason = (message: string, reason: string | undefined) => (reason ? `${message} (${reason})` : message);

/**
 * Moves playback to the device, keeping the current play/pause state unless `play` is set. Returns a user-facing
 * error message on failure.
 */
export async function transferPlayback(token: string, deviceId: string, play?: boolean): Promise<string | undefined> {
  const body = JSON.stringify({ device_ids: [deviceId], ...(play ? { play } : {}) });
  const res = await spotifyFetch(token, "/me/player", { method: "PUT", body }).catch(() => null);
  if (!res) return "Spotify nicht erreichbar";
  if (res.ok) return;
  const reason = await errorReason(res, "Geräteübertragung");
  return res.status === 404 ? DEVICE_GONE : withReason("Gerät konnte nicht aktiviert werden", reason);
}

/** `?device_id=…` for player requests, if the host picked a device. */
export function deviceQuery(deviceId: string | undefined, sep: "?" | "&" = "?") {
  return deviceId ? `${sep}device_id=${encodeURIComponent(deviceId)}` : "";
}

/**
 * Sends a player effect. A track is started via its album (`context_uri` + offset): the Spotify apps (desktop,
 * mobile, TV) accept a single track via `uris` with 204 but then play nothing — only the web player plays it.
 */
async function effectRequest(token: string, effect: Effect, deviceId?: string, { viaAlbum = true } = {}) {
  switch (effect.type) {
    case "play": {
      if (!effect.trackId) return spotifyFetch(token, `/me/player/play${deviceQuery(deviceId)}`, { method: "PUT" });
      const uri = `spotify:track:${effect.trackId}`;
      const albumUri = viaAlbum ? (await trackRef(token, effect.trackId))?.albumUri : undefined;
      const position = effect.positionMs ? { position_ms: effect.positionMs } : {};
      const body = albumUri ? { context_uri: albumUri, offset: { uri }, ...position } : { uris: [uri], ...position };
      return spotifyFetch(token, `/me/player/play${deviceQuery(deviceId)}`, { method: "PUT", body: JSON.stringify(body) });
    }
    case "pause":
      return spotifyFetch(token, `/me/player/pause${deviceQuery(deviceId)}`, { method: "PUT" });
    case "seek":
      return spotifyFetch(token, `/me/player/seek?position_ms=${effect.positionMs}${deviceQuery(deviceId, "&")}`, { method: "PUT" });
  }
}

/** Dormant Connect devices (idle for a while, phone apps in the background) answer the first command with 404/5xx. */
const isWakeable = (status: number) => status === 404 || status >= 500;
const PLAY_RETRIES = 2;
const NO_DEVICE = "Kein aktives Spotify-Gerät – starte Spotify auf dem Gerät, wo die Musik laufen soll";
/** Waits between Spotify requests can be scaled down (tests set 0). */
export const timing = { scale: 1 };
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms * timing.scale));

export interface RunEffectOptions {
  /** Wait before retrying a failed "play" on a woken device. */
  retryDelayMs?: number;
  /** When to ask whether a played track plays, each after the one before (empty: don't ask). */
  checkDelaysMs?: number[];
  /** Learns how long Spotify took to report a played track as playing (for the log); without it nobody asks. */
  onCheck?: (check: PlayCheck) => void;
}

/** How long Spotify took to report a played track as playing; none: not within CHECK_DELAYS_MS. */
export interface PlayCheck { reportedAfterMs?: number }

/** When to ask Spotify whether a played track plays: up to 5 s. */
export const CHECK_DELAYS_MS = [800, ...Array<number>(7).fill(600)];

/**
 * Executes a player effect on the given device (or the host's active device). A failed "play" on a picked
 * device wakes it with a playback transfer and is retried. Returns a user-facing error message on failure.
 *
 * A "play" Spotify accepted is left alone, even if Spotify reports it only late or not at all: a Google TV stick
 * reported new songs after up to 3.4 s, sometimes never although the music played, and waking it then by a
 * transfer with `play: true` only played the previous song for a moment (games, Nov 2026).
 */
export async function runEffect(token: string, effect: Effect, deviceId?: string, opts: RunEffectOptions = {}): Promise<string | undefined> {
  const { retryDelayMs = 1000, checkDelaysMs = CHECK_DELAYS_MS, onCheck } = opts;
  let res: Response;
  try {
    res = await effectRequest(token, effect, deviceId);
    for (let attempt = 0; effect.type === "play" && deviceId && isWakeable(res.status) && attempt < PLAY_RETRIES; attempt++) {
      await errorReason(res, "Abspielen");
      await transferPlayback(token, deviceId);
      await sleep(retryDelayMs);
      res = await effectRequest(token, effect, deviceId);
    }
    // The album start was rejected (e.g. the track is not on that album for this market) → the track alone
    if (effect.type === "play" && effect.trackId && (res.status === 400 || res.status === 403)) {
      await errorReason(res, "Abspielen über das Album");
      res = await effectRequest(token, effect, deviceId, { viaAlbum: false });
    }
    if (res.ok && effect.type === "play" && effect.trackId && checkDelaysMs.length && onCheck) {
      onCheck({ reportedAfterMs: await waitUntilPlaying(token, effect.trackId, deviceId, checkDelaysMs) });
    }
  } catch {
    return "Spotify nicht erreichbar";
  }
  if (res.ok) return;
  const reason = await errorReason(res, effect.type === "play" ? "Abspielen" : effect.type === "pause" ? "Pausieren" : "Spulen");
  // "Restriction violated": the player already is in that state (pausing while paused, resuming while playing)
  if (res.status === 403 && (effect.type === "pause" || (effect.type === "play" && !effect.trackId))) return;
  if (res.status === 404) return deviceId ? DEVICE_GONE : NO_DEVICE;
  return withReason("Spotify-Wiedergabe fehlgeschlagen", reason);
}

/** Whether Spotify reports the track as playing (on the device, if given). */
async function isPlayingTrack(token: string, trackId: string, deviceId?: string) {
  const state = await fetchPlayerState(token);
  return !!state?.isPlaying && !!state.track && sameTrack(trackId, state.track.id, state.track.name)
    && (!deviceId || state.device?.id === deviceId);
}

/** Asks Spotify after each delay whether the track plays; resolves to the time until it did, or undefined. */
async function waitUntilPlaying(token: string, trackId: string, deviceId: string | undefined, delaysMs: number[]) {
  const start = Date.now();
  for (const ms of delaysMs) {
    await sleep(ms);
    if (await isPlayingTrack(token, trackId, deviceId)) return Date.now() - start;
  }
}

/**
 * Saves songs as a new private playlist in the user's account (needs the `playlist-modify-private` scope).
 * Resolves to the playlist's ID and Spotify link, or a user-facing error.
 */
export async function createPlaylist(token: string, name: string, description: string, trackIds: string[]): Promise<{ id: string; url: string } | { error: string }> {
  const res = await spotifyFetch(token, "/me/playlists", {
    method: "POST", body: JSON.stringify({ name, description, public: false }),
  }).catch(() => null);
  if (res?.status === 401 || res?.status === 403) return { error: "Spotify erlaubt das Speichern noch nicht – melde dich einmal ab und wieder an" };
  const playlist = res?.ok ? await res.json().catch(() => null) as { id?: string; external_urls?: { spotify?: string } } | null : null;
  if (!playlist?.id) return { error: "Playlist konnte nicht angelegt werden" };
  const added = await addToPlaylist(token, playlist.id, trackIds);
  if (added) return added;
  return { id: playlist.id, url: playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlist.id}` };
}

/** Appends songs to a playlist of the user's; resolves to a user-facing error if that fails. */
export async function addToPlaylist(token: string, playlistId: string, trackIds: string[]): Promise<{ error: string } | undefined> {
  for (let i = 0; i < trackIds.length; i += 100) {
    const uris = trackIds.slice(i, i + 100).map(id => `spotify:track:${id}`);
    const added = await spotifyFetch(token, `/playlists/${playlistId}/items`, { method: "POST", body: JSON.stringify({ uris }) }).catch(() => null);
    if (!added?.ok) return { error: "Songs konnten nicht in die Playlist übernommen werden" };
  }
}
