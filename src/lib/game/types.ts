// Shared between server and client. Must not contain secrets — the whole Game is sent to every player.
import type { ModeAction, ModeData, ModeId } from "./modes";

export interface Player {
  id: string;
  name: string;
  joinedAt: number;
}

export interface Track {
  id: string;
  name: string;
  artist: string;
  album?: string;
  releaseYear?: string;
  albumArt: string | null;
  previewUrl: string | null;
  /** International Standard Recording Code — identifies the exact recording. */
  isrc?: string;
  /** True once releaseYear was checked against the original release (MusicBrainz). */
  yearVerified?: boolean;
}

export interface SongInfo {
  name: string;
  artist: string;
  releaseYear?: string;
  albumArt: string | null;
}

/** Settings every game mode shares. Mode-specific settings live in `game.mode.settings`. */
export interface CoreSettings {
  /** "rounds": fixed number of full rotations; "score": first player to reach `targetScore` wins. */
  goal: "rounds" | "score";
  maxRounds: number;
  targetScore: number;
  playerOrder: "sequential" | "random";
  songSource: "players" | "playlist";
  playlistId?: string;
}

export interface Game {
  id: string;
  /** Incremented on every server-side change; clients ignore updates older than what they have. */
  version: number;
  players: Player[];
  createdAt: number;
  status: "lobby" | "playing" | "finished";
  hostPlayerId: string;
  /** Whose turn it is (index into `players`). */
  currentPlayerIndex: number;
  currentRound: number;
  scores: Record<string, number>;
  settings: CoreSettings;
  /** State and settings of the selected game mode. */
  mode: ModeData;
  playlistTrackCount?: number;
  playlistIndex?: number;
  viewers: string[];        // player IDs marked as viewer in lobby
  viewerPlayers?: Player[]; // viewer players moved here at game start
  /** Number of big-screen views currently connected (maintained by the server, not the reducer). */
  connectedScreens?: number;
}

export type CoreAction =
  | { type: "updateSettings"; patch: Partial<CoreSettings> }
  | { type: "updateModeSettings"; patch: Record<string, unknown> }
  | { type: "setMode"; mode: ModeId }
  | { type: "kick"; playerId: string }
  | { type: "toggleViewer"; playerId: string }
  | { type: "start" }
  | { type: "reset" }
  | { type: "play"; trackId?: string }
  | { type: "pause" }
  | { type: "seek"; positionMs: number };

export type Action = CoreAction | ModeAction;

/** Side effects on the host's Spotify player, executed by the server after an action succeeded. */
export type Effect =
  | { type: "play"; trackId?: string } // no trackId → resume
  | { type: "pause" }
  | { type: "seek"; positionMs: number };

/** State of the host's Spotify player, broadcast to all clients. */
export interface Playback {
  trackId: string | null;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
}

/** Messages sent over the game's server-sent event stream. */
export type GameEvent =
  | { type: "game"; game: Game }
  | { type: "playback"; playback: Playback }
  | { type: "deleted" };

/** Request header carrying the per-player secret issued on join. */
export const PLAYER_TOKEN_HEADER = "x-player-token";
