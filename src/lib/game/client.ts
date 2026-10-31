import { browseParams, type BrowseFilter } from "../browse";
import type { PlayerState, SpotifyDevice } from "../spotify";
import type { ModeId } from "./modes";
import { PLAYER_TOKEN_HEADER, type Action, type Game, type SongInfo, type Track } from "./types";

export interface PlaylistResult { id: string; name: string; image: string | null; owner: string; trackCount: number }
/** Playlists per page of a search; a full page means more may follow. */
export const PLAYLIST_PAGE = 10;
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
    /** Lobby music (host): a song or playlist, pause or resume. Resolves to an error message, if any. */
    async music(body: { trackId: string } | { playlistId: string } | { pause: true } | { resume: true }): Promise<string | undefined> {
      const res = await fetch(`${base}/music`, { method: "POST", headers, body: JSON.stringify(body) }).catch(() => null);
      if (res?.ok) return;
      return (await res?.json().catch(() => null))?.error ?? "Verbindung fehlgeschlagen";
    },
    /** Host: connects the TV showing this code to the game. Resolves to an error message, if any. */
    async pairScreen(code: string): Promise<string | undefined> {
      const res = await fetch(`${base}/screen`, { method: "POST", headers, body: JSON.stringify({ code }) }).catch(() => null);
      if (res?.ok) return;
      return (await res?.json().catch(() => null))?.error ?? "Verbindung fehlgeschlagen";
    },
    /** One page of songs matching `q`, from `offset`; `more`: another page may follow. */
    searchTracks: (q: string, offset = 0) =>
      get<{ tracks: Track[]; more: boolean }>(`/search?q=${encodeURIComponent(q)}&offset=${offset}`, { tracks: [], more: false }),
    /** After the game (host): saves its songs as a Spotify playlist. Resolves to the link or an error. */
    async savePlaylist(): Promise<{ url?: string; error?: string }> {
      const res = await fetch(`${base}/save-playlist`, { method: "POST", headers }).catch(() => null);
      const data = await res?.json().catch(() => null);
      return res?.ok ? { url: data.url } : { error: data?.error ?? "Verbindung fehlgeschlagen" };
    },
    /** "Alle gegen alle": the song, only for the player who buzzed. */
    answer: () => get<{ song: SongInfo | null }>("/answer", { song: null }).then(d => d.song),
    /** One page of songs of a decade and/or genre, from `offset`. */
    browseTracks: (filter: BrowseFilter, offset = 0) =>
      get<{ tracks: Track[]; more: boolean }>(`/browse?${browseParams(filter)}&offset=${offset}`, { tracks: [], more: false }),
    /** A random song of a decade and/or genre. */
    randomTrack: (filter: BrowseFilter) => get<{ track: Track | null }>(`/random?${browseParams(filter)}`, { track: null }).then(d => d.track),
    searchPlaylists: (q: string, offset = 0) =>
      get<{ playlists: PlaylistResult[] }>(`/playlist-search?q=${encodeURIComponent(q)}${offset ? `&offset=${offset}` : ""}`, { playlists: [] }).then(d => d.playlists),
    async loadPlaylist(playlistId: string): Promise<{ game?: Game; error?: string }> {
      const res = await fetch(`${base}/playlist`, { method: "POST", headers, body: JSON.stringify({ playlistId }) }).catch(() => null);
      const data = await res?.json().catch(() => null);
      if (!res) return { error: "Verbindung fehlgeschlagen" };
      return res.ok ? { game: data } : { error: data?.error ?? "Fehler beim Laden" };
    },
    async listDevices(): Promise<{ devices?: SpotifyDevice[]; error?: string }> {
      const res = await fetch(`${base}/devices`, { headers }).catch(() => null);
      const data = await res?.json().catch(() => null);
      return res?.ok ? { devices: data.devices } : { error: data?.error ?? "Verbindung fehlgeschlagen" };
    },
    /** Picks the playback device; null → the host's active Spotify device. */
    async selectDevice(deviceId: string | null): Promise<{ game?: Game; error?: string }> {
      const res = await fetch(`${base}/devices`, { method: "POST", headers, body: JSON.stringify({ deviceId }) }).catch(() => null);
      const data = await res?.json().catch(() => null);
      return res?.ok ? { game: data } : { error: data?.error ?? "Verbindung fehlgeschlagen" };
    },
    /** Host: closes the lobby; `closed`: the game stays with the evening's summary, otherwise it is gone. */
    closeLobby: async (): Promise<{ closed: boolean }> => {
      const res = await fetch(base, { method: "DELETE", headers }).catch(() => null);
      return { closed: !!(await res?.json().catch(() => null))?.closed };
    },
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

export interface HostGame { gameId: string; playerId: string; token: string }

/** Creates a game hosted by the logged-in Spotify user, optionally playing on the given device. */
export async function createHostedGame(mode: ModeId, deviceId?: string): Promise<HostGame | null> {
  const res = await fetch("/api/game/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, deviceId }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json();
  return { gameId: data.game.id, playerId: data.playerId, token: data.token };
}

/** What plays where on the logged-in user's Spotify, plus their devices (null if unavailable). */
export async function fetchPlayerSetup(): Promise<{ player: PlayerState; devices: SpotifyDevice[] } | null> {
  const res = await fetch("/api/spotify/player").catch(() => null);
  return res?.ok ? res.json() : null;
}
