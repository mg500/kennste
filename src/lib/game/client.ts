import { PLAYER_TOKEN_HEADER, type Action, type Game, type Track } from "./types";

export interface PlaylistResult { id: string; name: string; image: string | null; owner: string; trackCount: number }
export interface Credentials { playerId: string; token: string }

/** Typed wrapper around the game API for one authenticated player. */
export function gameApi(gameId: string, token: string) {
  const base = `/api/game/${gameId}`;
  const headers = { "Content-Type": "application/json", [PLAYER_TOKEN_HEADER]: token };
  const get = async <T>(path: string, fallback: T): Promise<T> => {
    const res = await fetch(`${base}${path}`, { headers }).catch(() => null);
    return res?.ok ? res.json() : fallback;
  };

  return {
    gameId,
    /** Sends an action. Resolves to the updated game (if accepted) and a user-facing error, if any. */
    async act(action: Action): Promise<{ game?: Game; error?: string }> {
      const res = await fetch(`${base}/action`, { method: "POST", headers, body: JSON.stringify(action) }).catch(() => null);
      const data = await res?.json().catch(() => null);
      if (!res?.ok) return { error: data?.error ?? "Verbindung fehlgeschlagen" };
      return { game: data.game, error: data.spotifyError };
    },
    searchTracks: (q: string) => get<{ tracks: Track[] }>(`/search?q=${encodeURIComponent(q)}`, { tracks: [] }).then(d => d.tracks),
    randomTrack: () => get<{ track: Track | null }>("/random", { track: null }).then(d => d.track),
    searchPlaylists: (q: string) =>
      get<{ playlists: PlaylistResult[] }>(`/playlist-search?q=${encodeURIComponent(q)}`, { playlists: [] }).then(d => d.playlists),
    async loadPlaylist(playlistId: string): Promise<{ game?: Game; error?: string }> {
      const res = await fetch(`${base}/playlist`, { method: "POST", headers, body: JSON.stringify({ playlistId }) });
      const data = await res.json().catch(() => ({}));
      return res.ok ? { game: data } : { error: data.error ?? "Fehler beim Laden" };
    },
    deleteGame: () => fetch(base, { method: "DELETE", headers }),
  };
}

export type GameApi = ReturnType<typeof gameApi>;

const storageKey = (gameId: string) => `game-player-${gameId}`;

export function loadCredentials(gameId: string): Credentials | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey(gameId)) ?? "null");
    return saved?.playerId && saved?.token ? saved : null;
  } catch {
    return null;
  }
}

export function saveCredentials(gameId: string, creds: Credentials | null) {
  try {
    if (creds) sessionStorage.setItem(storageKey(gameId), JSON.stringify(creds));
    else sessionStorage.removeItem(storageKey(gameId));
  } catch {}
}
