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
  durationMs?: number;
  /** International Standard Recording Code — identifies the exact recording. */
  isrc?: string;
  /** True once releaseYear was checked against the original release (MusicBrainz). */
  yearVerified?: boolean;
}

/** A Spotify Connect device the host picked for playback. */
export interface PlaybackDevice {
  id: string;
  name: string;
  /** Spotify device type, e.g. "Computer", "Smartphone", "Speaker", "TV". */
  type: string;
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
  /** Name and cover of the loaded playlist. */
  playlistInfo?: { name: string; image: string | null };
  /** A playlist the host picked during the game: it takes over with the next song (maintained by the server). */
  pendingPlaylist?: { name: string; image: string | null };
  /** More songs of the playlist are being read from Spotify right now (maintained by the server). */
  playlistLoading?: boolean;
  /** The game ended early because every song of the playlist was played. */
  outOfSongs?: boolean;
  /** What the TV view shows in the lobby (default: the lobby). */
  screenView?: ScreenView;
  viewers: string[];        // player IDs marked as viewer in lobby
  viewerPlayers?: Player[]; // viewer players moved here at game start
  /** Device the music plays on; none → whatever device is active in the host's Spotify (maintained by the server). */
  device?: PlaybackDevice;
  /** Number of big-screen views currently connected (maintained by the server, not the reducer). */
  connectedScreens?: number;
  /** After a revealed round: who wants to move on, and since when the countdown runs once a majority does. */
  continueVote?: ContinueVote;
  /** Every revealed round of the running (or just finished) game: for the songs and awards at the end. */
  history?: RoundRecord[];
}

/** One revealed round, written by the mode when it reveals (see `Turn.record`). */
export interface RoundRecord {
  round: number;
  song: SongInfo & { trackId: string };
  /** Points each player won in this round. */
  points: Record<string, number>;
  /** Who put the song on (buzzer quiz with songs picked by players). */
  pickedBy?: string;
  /** What each player did in this round, only for those who took part. */
  stats: Record<string, PlayerRoundStats>;
}

/** Facts about one player in one round, as far as the mode knows them (for the awards). */
export interface PlayerRoundStats {
  /** How often they buzzed. */
  buzzes?: number;
  /** Ms from the start of the song to their right answer (buzz or tap). */
  rightMs?: number;
  /** Judged themselves wrong ("Alle gegen alle"). */
  selfWrong?: number;
  /** Voted "Stimmt nicht" on someone else's "right". */
  votedNo?: number;
  /** Years off (Jahr schätzen). */
  yearsOff?: number;
  /** Got the bonus for the fastest right answer (Song-Tipp). */
  fastest?: boolean;
  /** Placed a card right between these two years (Zeitstrahl), for the narrowest gap. */
  gap?: [number, number];
}

export interface ContinueVote {
  playerIds: string[];
  /** Set once enough players want to continue; the server continues `CONTINUE_COUNTDOWN_SEC` later. */
  countdownAt?: number;
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
  | { type: "seek"; positionMs: number }
  | { type: "setScreenView"; view: ScreenView }
  | { type: "voteContinue"; want: boolean };

/** What the TV view shows in the lobby: the lobby, or what's playing right now (switched by the host). */
export type ScreenView = "lobby" | "nowPlaying";

export type Action = CoreAction | ModeAction;

/** Side effects on the host's Spotify player, executed by the server after an action succeeded. */
export type Effect =
  | { type: "play"; trackId?: string; positionMs?: number } // no trackId → resume
  | { type: "pause" }
  | { type: "seek"; positionMs: number };

/** State of the host's Spotify player, broadcast to all clients. */
export interface Playback {
  trackId: string | null;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  /** Title and cover of what plays — only in the lobby, during a game they would give the song away. */
  track?: { name: string; artist: string; albumArt: string | null; releaseYear?: string };
}

/** Messages sent over the game's server-sent event stream. */
export type GameEvent =
  | { type: "game"; game: Game }
  | { type: "playback"; playback: Playback }
  | { type: "deleted" };

/** Request header carrying the per-player secret issued on join. */
export const PLAYER_TOKEN_HEADER = "x-player-token";
