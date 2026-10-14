// Shared between server and client. Must not contain secrets — the whole Game is sent to every player.

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
}

export type HintField = "cover" | "title" | "artist" | "year";

export interface Round {
  state: "picking" | "playing" | "buzzed";
  trackId?: string;
  songName?: string;
  artistName?: string;
  albumName?: string;
  releaseYear?: string;
  albumArt?: string;
  previewUrl?: string | null;
  buzzedBy?: string;
  buzzedPlayers: string[];
  buzzCounts: Record<string, number>;
  buzzedAt?: number;
  playingAt?: number;
  skippedPlayers: string[];
  wrongPlayers: string[];
  hintRevealed?: boolean;
  hintTitleRevealed?: boolean;
  hintArtistRevealed?: boolean;
  hintYearRevealed?: boolean;
}

export interface GuessedSong {
  songName: string;
  artistName: string;
  albumArt?: string;
}

export interface GameSettings {
  autoPauseOnBuzz: boolean;
  gameMode: "rounds" | "bestOf";
  maxRounds: number;   // used when gameMode === "rounds"
  bestOf: number;      // used when gameMode === "bestOf"
  hintsEnabled: Record<HintField, boolean>;
  playerOrder: "sequential" | "random";
  maxBuzzesPerRound: number;
  buzzTimeLimit: number;  // seconds after buzz to answer, 0 = no limit
  playTimeLimit: number;  // seconds before picker can reveal, 0 = no limit
  songSource: "players" | "playlist";
  playlistId?: string;
}

export interface LastResult {
  type: "correct" | "wrong" | "revealed";
  byPlayerName?: string;
}

export interface Game {
  id: string;
  players: Player[];
  createdAt: number;
  status: "lobby" | "playing" | "finished";
  hostPlayerId: string;
  currentPlayerIndex: number;
  currentRound: number;
  scores: Record<string, number>;
  guessedSongs: Record<string, GuessedSong[]>;
  settings: GameSettings;
  lastResult?: LastResult;
  round?: Round;
  playlistTrackCount?: number;
  playlistIndex?: number;
  viewers: string[];        // player IDs marked as viewer in lobby
  viewerPlayers?: Player[]; // viewer players moved here at game start
}

export type Action =
  | { type: "updateSettings"; patch: Partial<GameSettings> }
  | { type: "kick"; playerId: string }
  | { type: "toggleViewer"; playerId: string }
  | { type: "start" }
  | { type: "pickSong"; track: Track }
  | { type: "buzz" }
  | { type: "skip" }
  | { type: "hint"; field: HintField }
  | { type: "judge"; verdict: "correct" | "wrong" }
  | { type: "reveal" }
  | { type: "reset" }
  | { type: "play"; trackId?: string }
  | { type: "pause" }
  | { type: "seek"; positionMs: number };

/** Side effects on the host's Spotify player, executed by the server after an action succeeded. */
export type Effect =
  | { type: "play"; trackId?: string } // no trackId → resume
  | { type: "pause" }
  | { type: "seek"; positionMs: number };

/** Request header carrying the per-player secret issued on join. */
export const PLAYER_TOKEN_HEADER = "x-player-token";
