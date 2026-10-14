import type { Effect, Game, Player, Track } from "../types";

export interface Context {
  now: number;
  random: () => number;
  playlist?: Track[];
}

/** Core services a mode uses to drive the game forward. */
export interface Turn {
  ctx: Context;
  /** Next track from the loaded playlist (advances the position), or null when players pick songs. */
  nextPlaylistTrack(): Track | null;
  /** Adds points. Returns true if this finished the game (score goal reached). */
  award(playerId: string, points: number): boolean;
  /** Ends the current turn: finishes the game after the last round, otherwise starts the next turn. */
  endTurn(): void;
}

export interface Roles {
  actorId: string;
  isHost: boolean;
  /** It is this player's turn. */
  isActive: boolean;
  /** Takes part in the game but it's not their turn (viewers excluded). */
  isOpponent: boolean;
  activePlayer?: Player;
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
}
