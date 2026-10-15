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
  /** When to check that a played track really plays (empty: don't check). */
  checkDelaysMs?: number[];
}

/**
 * Executes a player effect on the given device (or the host's active device). A failed "play" on a picked
 * device wakes it with a playback transfer and is retried; a "play" Spotify accepted is checked to really
 * start (see ensurePlaying). Returns a user-facing error message on failure.
 */
export async function runEffect(token: string, effect: Effect, deviceId?: string, opts: RunEffectOptions = {}): Promise<string | undefined> {
  const { retryDelayMs = 1000, checkDelaysMs = [800, 1200] } = opts;
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
    if (res.ok && effect.type === "play" && effect.trackId && checkDelaysMs.length) {
      return await ensurePlaying(token, { ...effect, trackId: effect.trackId }, deviceId, checkDelaysMs);
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

/**
 * Spotify may accept a play command although the device never reacts (dormant devices). If the track does not
 * play shortly after, the device is woken by a transfer that starts playback, and the track is played again.
 */
async function ensurePlaying(token: string, effect: Effect & { type: "play"; trackId: string }, deviceId: string | undefined, checkDelaysMs: number[]) {
  for (const ms of checkDelaysMs) {
    await sleep(ms);
    if (await isPlayingTrack(token, effect.trackId, deviceId)) return;
  }
  const target = deviceId ?? (await fetchPlayerState(token))?.device?.id;
  if (!target) return NO_DEVICE;
  console.warn("Spotify: Song startet nicht – Gerät wird geweckt");
  await transferPlayback(token, target, true);
  await sleep(checkDelaysMs[0]);
  const res = await effectRequest(token, effect, target);
  if (!res.ok) return withReason("Spotify-Wiedergabe fehlgeschlagen", await errorReason(res, "Abspielen"));
  await sleep(checkDelaysMs.at(-1)!);
  if (await isPlayingTrack(token, effect.trackId, target)) return;
  return "Das Gerät reagiert nicht – öffne dort Spotify und spiel kurz etwas an";
}
