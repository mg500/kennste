import { getMode } from "./modes";
import type { Game } from "./types";

/** Who looks at the game: a player (by ID), or null for the TV and spectators. */
export type ViewerId = string | null;

/**
 * What one device may see of the game. The server keeps the full state; every device gets this view instead, so
 * nothing that isn't revealed yet (the song, the others' guesses) can be read in the browser's developer tools.
 * The running song's Spotify ID is replaced by `mask(id)`, a stand-in that matches the playback state but can't be
 * looked up on Spotify. Outside a game there is nothing to hide.
 */
export function viewFor(game: Game, viewer: ViewerId, mask: (trackId: string) => string): Game {
  if (game.status !== "playing") return game;
  return { ...game, mode: getMode(game.mode.id).view(game, game.mode, viewer, mask) };
}

