import type { CoreSettings, Effect, Game, Player, Track } from "../types";

export interface Context {
  now: number;
  random: () => number;
  playlist?: Track[];
}

/** Core services a mode uses to drive the game forward. */
export interface Turn {
  ctx: Context;
  /** Next track from the loaded playlist (advances the position), or null when players pick songs or all were played. */
  nextPlaylistTrack(): Track | null;
  /** Adds points to a player's score. */
  award(playerId: string, points: number): void;
  /** Ends the current turn: finishes the game when the goal is reached, otherwise starts the next turn. */
  endTurn(): void;
  /** Queues a Spotify effect (e.g. start playing the next song when a turn starts). */
  effect(effect: Effect): void;
  /** Ends the game right away (e.g. a team ran out of lives). */
  finishGame(): void;
  /** Ends the game because every song of the playlist was played. */
  outOfSongs(): void;
}

export interface Roles {
  actorId: string;
  isHost: boolean;
  /** It is this player's turn. */
  isActive: boolean;
  /** Takes part in the game but it's not their turn (viewers excluded). */
  isOpponent: boolean;
  activePlayer?: Player;
  /** May continue after a revealed round: the next player (or the active one before the final standings), or the host. */
  mayContinue: boolean;
}

export type ModeResult =
  | { ok: true; effects: Effect[] }
  | { ok: false; error: string; status: 400 | 403 };

/**
 * A game mode: owns its settings, round state and actions. Everything else (lobby, players, roles,
 * turn order, end condition, playlist, playback control) is handled by the core reducer.
 * Implementations must be pure and may mutate `data`, which is the (already cloned) `game.mode`.
 */
export interface GameMode<D, A extends { type: string }> {
  name: string;
  /** Songs must come from a playlist (players cannot pick their own). */
  requiresPlaylist?: boolean;
  /**
   * Everyone plays every round at once: a turn is one round (one song), nobody is "active" and the
   * host continues after a revealed round.
   */
  simultaneous?: boolean;
  /** What a point is called, e.g. "Karte"/"Karten" (default "Punkt"/"Punkte"). */
  scoreUnit?: { one: string; many: string };
  /** Core settings applied when this mode is selected. */
  coreDefaults?: Partial<CoreSettings>;
  create(): D;
  applySettings(data: D, patch: Record<string, unknown>, inLobby: boolean): void;
  parseAction(body: Record<string, unknown>): A | null;
  /** Sets up the round for the player whose turn it now is. */
  startTurn(game: Game, data: D, turn: Turn): void;
  /** Clears round state and results but keeps settings (start, reset, finish). */
  clear(data: D): void;
  apply(game: Game, data: D, roles: Roles, action: A, turn: Turn): ModeResult;
  /** Track currently in play, used to sync the playback bar. */
  currentTrackId(data: D): string | undefined;
  /** Cover of the current song, used for the accent color and background. */
  currentCover(data: D): string | undefined;
  /**
   * Called by the server once Spotify actually plays `trackId` (e.g. to start timers only then).
   * Returns true if `data` changed.
   */
  onPlaying?(data: D, trackId: string, now: number): boolean;
  /**
   * When the current round ends on its own (ms timestamp), e.g. the time to answer is up. The server sends a
   * `timeout` action then — independent of whose phone is still connected or in the foreground.
   */
  deadline?(data: D): number | null;
  /** How long the current song may play once it started (ms); the server pauses it afterwards. */
  playLimitMs?(data: D): number | undefined;
  /** Called when that limit is reached. Returns true if the song should be paused (`data` changed). */
  onPlayLimit?(data: D, trackId: string): boolean;
  /** Set when everyone plays as one team: the outcome for the final screen instead of a ranking. */
  teamResult?(data: D): { won: boolean; title: string; subtitle: string } | null;
}
