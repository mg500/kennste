import type { Effect, Playback, Track } from "./game/types";

const API = "https://api.spotify.com/v1";

export interface SpotifyTrack {
  id?: string;
  name?: string;
  preview_url?: string | null;
  artists?: { name: string }[];
  album?: { name?: string; images?: { url: string }[]; release_date?: string };
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

/** Executes a player effect on the host's active device. Returns a user-facing error message on failure. */
export async function runEffect(token: string, effect: Effect): Promise<string | undefined> {
  let res: Response;
  try {
    switch (effect.type) {
      case "play":
        res = await spotifyFetch(token, "/me/player/play", {
          method: "PUT",
          body: effect.trackId ? JSON.stringify({ uris: [`spotify:track:${effect.trackId}`] }) : undefined,
        });
        break;
      case "pause":
        res = await spotifyFetch(token, "/me/player/pause", { method: "PUT" });
        break;
      case "seek":
        res = await spotifyFetch(token, `/me/player/seek?position_ms=${effect.positionMs}`, { method: "PUT" });
        break;
    }
  } catch {
    return "Spotify nicht erreichbar";
  }
  if (res.status === 404) return "Kein aktives Spotify-Gerät";
  if (!res.ok) return "Spotify-Wiedergabe fehlgeschlagen";
}
