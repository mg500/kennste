import type { Effect, Playback, Track } from "./game/types";

const API = "https://api.spotify.com/v1";

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

export async function fetchPlayback(token: string): Promise<Playback | null> {
  const res = await spotifyFetch(token, "/me/player").catch(() => null);
  if (!res) return null;
  if (res.status === 204) return { trackId: null, isPlaying: false, progressMs: 0, durationMs: 0 };
  if (!res.ok) return null;
  const data = await res.json();
  return {
    // linked_from holds the requested ID when Spotify relinked the track for the user's market
    trackId: data.item?.linked_from?.id ?? data.item?.id ?? null,
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

export const DEVICE_GONE = "Wiedergabegerät nicht erreichbar – im Menü ein anderes wählen";

/** Spotify's reason for a failed player request (e.g. "Restriction violated"), logged for debugging. */
async function errorReason(res: Response, what: string): Promise<string | undefined> {
  const body = await res.json().catch(() => null) as { error?: { message?: string; reason?: string } } | null;
  const reason = body?.error?.reason ?? body?.error?.message;
  console.warn(`Spotify: ${what} fehlgeschlagen (${res.status}${reason ? `, ${reason}` : ""})`);
  return reason;
}

const withReason = (message: string, reason: string | undefined) => (reason ? `${message} (${reason})` : message);

/** Moves playback to the device, keeping the current play/pause state. Returns a user-facing error message on failure. */
export async function transferPlayback(token: string, deviceId: string): Promise<string | undefined> {
  const res = await spotifyFetch(token, "/me/player", { method: "PUT", body: JSON.stringify({ device_ids: [deviceId] }) }).catch(() => null);
  if (!res) return "Spotify nicht erreichbar";
  if (res.ok) return;
  const reason = await errorReason(res, "Geräteübertragung");
  return res.status === 404 ? DEVICE_GONE : withReason("Gerät konnte nicht aktiviert werden", reason);
}

/** `?device_id=…` for player requests, if the host picked a device. */
export function deviceQuery(deviceId: string | undefined, sep: "?" | "&" = "?") {
  return deviceId ? `${sep}device_id=${encodeURIComponent(deviceId)}` : "";
}

function effectRequest(token: string, effect: Effect, deviceId?: string) {
  switch (effect.type) {
    case "play":
      return spotifyFetch(token, `/me/player/play${deviceQuery(deviceId)}`, {
        method: "PUT",
        body: effect.trackId
          ? JSON.stringify({ uris: [`spotify:track:${effect.trackId}`], ...(effect.positionMs ? { position_ms: effect.positionMs } : {}) })
          : undefined,
      });
    case "pause":
      return spotifyFetch(token, `/me/player/pause${deviceQuery(deviceId)}`, { method: "PUT" });
    case "seek":
      return spotifyFetch(token, `/me/player/seek?position_ms=${effect.positionMs}${deviceQuery(deviceId, "&")}`, { method: "PUT" });
  }
}

/** Dormant Connect devices (idle for a while, phone apps in the background) answer the first command with 404/5xx. */
const isWakeable = (status: number) => status === 404 || status >= 500;
const PLAY_RETRIES = 2;

/**
 * Executes a player effect on the given device (or the host's active device). A failed "play" on a picked
 * device wakes it with a playback transfer and is retried. Returns a user-facing error message on failure.
 */
export async function runEffect(token: string, effect: Effect, deviceId?: string, { retryDelayMs = 1000 } = {}): Promise<string | undefined> {
  let res: Response;
  try {
    res = await effectRequest(token, effect, deviceId);
    for (let attempt = 0; effect.type === "play" && deviceId && isWakeable(res.status) && attempt < PLAY_RETRIES; attempt++) {
      await errorReason(res, "Abspielen");
      await transferPlayback(token, deviceId);
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      res = await effectRequest(token, effect, deviceId);
    }
  } catch {
    return "Spotify nicht erreichbar";
  }
  if (res.ok) return;
  const reason = await errorReason(res, effect.type === "play" ? "Abspielen" : effect.type === "pause" ? "Pausieren" : "Spulen");
  if (res.status === 404) return deviceId ? DEVICE_GONE : "Kein aktives Spotify-Gerät – starte Spotify auf dem Gerät, wo die Musik laufen soll";
  return withReason("Spotify-Wiedergabe fehlgeschlagen", reason);
}
