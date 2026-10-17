import type { Game, Track } from "../types";
import { playEffect } from "./play";
import type { GameMode, Turn } from "./types";

// ── Jahr schätzen: everyone guesses the release year of the same song ────────

export interface YearSettings {
  /** Seconds to guess once the song plays, 0 = no limit. */
  guessTimeLimit: number;
  /** Start songs somewhere in the middle instead of the intro. */
  randomStart: boolean;
}

export interface YearSong {
  name: string;
  artist: string;
  year: number;
  albumArt: string | null;
}

export interface YearRound {
  /** guessing: everyone picks a year → revealed: result shown until the host continues */
  state: "guessing" | "revealed";
  /** Only the ID is public (for playback sync) — title and year stay on the server until revealed. */
  trackId: string;
  /** When Spotify actually started playing the song (set by the server) — the time limit runs from here. */
  playingAt?: number;
  /** Guesses of the players who are done (they may still change them). */
  guesses: Record<string, number>;
  /** What the others have currently picked — counts as their guess when the time is up. */
  drafts?: Record<string, number>;
  result?: { song: YearSong; points: Record<string, number> };
}

export interface YearData {
  id: "year";
  settings: YearSettings;
  /** Track IDs already played, so no song repeats within a game. */
  played: string[];
  round?: YearRound;
}

export type YearAction =
  /** `draft`: just the currently picked year, the player isn't done yet. */
  | { type: "guess"; year: number; draft?: boolean }
  | { type: "reveal" }
  | { type: "timeout" }
  | { type: "next" };

export const MIN_YEAR = 1900;
/** Time limit tolerance for network delays. */
const GRACE_MS = 1000;

/** Points for a guess `distance` years off: exact 3, up to 2 years 2, up to 5 years 1. */
export function pointsFor(distance: number): number {
  return distance === 0 ? 3 : distance <= 2 ? 2 : distance <= 5 ? 1 : 0;
}

/** Narrows a game's mode data to "Jahr schätzen" (UI code of this mode only runs for these games). */
export function yearData(game: { mode: { id: string } }): YearData {
  if (game.mode.id !== "year") throw new Error(`Expected year game, got ${game.mode.id}`);
  return game.mode as YearData;
}

/** Deadline to guess, or null without limit / before playback started / after the reveal. */
export function guessDeadline(data: YearData): number | null {
  const limit = data.settings.guessTimeLimit;
  const round = data.round;
  return limit > 0 && round?.state === "guessing" && round.playingAt ? round.playingAt + limit * 1000 : null;
}

function songOf(track: Track): YearSong | null {
  const year = Number(track.releaseYear?.slice(0, 4));
  if (!Number.isInteger(year) || year < MIN_YEAR) return null;
  return { name: track.name, artist: track.artist, year, albumArt: track.albumArt };
}

/** Draws the next playlist track with a usable year that was not played yet. */
function draw(data: YearData, turn: Turn): Track | null {
  const total = turn.ctx.playlist?.length ?? 0;
  for (let i = 0; i < total; i++) {
    const track = turn.nextPlaylistTrack();
    if (!track) return null;
    if (songOf(track) && !data.played.includes(track.id)) return track;
  }
  return null;
}

/** The song currently being guessed, looked up server-side from the playlist (its year may have been corrected meanwhile). */
function currentTrack(game: Game, turn: Turn): Track | undefined {
  return game.playlistIndex === undefined ? undefined : turn.ctx.playlist?.[game.playlistIndex];
}

function reveal(game: Game, data: YearData, turn: Turn): string | null {
  const round = data.round!;
  const track = currentTrack(game, turn);
  const song = track?.id === round.trackId ? songOf(track) : null;
  if (!song) return "Song nicht gefunden";
  // Whatever someone picked counts, even if they didn't press "Fertig"
  round.guesses = { ...round.drafts, ...round.guesses };
  round.drafts = undefined;
  const points: Record<string, number> = {};
  for (const [playerId, guess] of Object.entries(round.guesses)) {
    points[playerId] = pointsFor(Math.abs(guess - song.year));
    if (points[playerId]) turn.award(playerId, points[playerId]);
  }
  round.state = "revealed";
  round.result = { song, points };
  return null;
}

export const year: GameMode<YearData, YearAction> = {
  name: "Jahr schätzen",
  requiresPlaylist: true,
  simultaneous: true,
  coreDefaults: { goal: "rounds", maxRounds: 10, songSource: "playlist" },

  create() {
    return { id: "year", settings: { guessTimeLimit: 30, randomStart: false }, played: [] };
  },

  applySettings(data, patch, inLobby) {
    if (!inLobby) return;
    const v = patch.guessTimeLimit;
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 300) data.settings.guessTimeLimit = v;
    if (typeof patch.randomStart === "boolean") data.settings.randomStart = patch.randomStart;
  },

  parseAction(a) {
    switch (a.type) {
      case "reveal": case "timeout": case "next":
        return { type: a.type };
      case "guess":
        return typeof a.year === "number" && Number.isInteger(a.year) && a.year >= MIN_YEAR && a.year <= 2100
          ? { type: a.type, year: a.year, ...(a.draft === true ? { draft: true } : {}) } : null;
      default:
        return null;
    }
  },

  startTurn(_game, data, turn) {
    const track = draw(data, turn);
    if (!track) { data.round = undefined; turn.outOfSongs(); return; }
    data.played.push(track.id);
    data.round = { state: "guessing", trackId: track.id, guesses: {} };
    turn.effect(playEffect(track, data.settings.randomStart, turn.ctx.random));
  },

  clear(data) {
    data.played = [];
    data.round = undefined;
  },

  deadline: guessDeadline,
  currentTrackId: data => data.round?.trackId,
  currentCover: data => data.round?.result?.song.albumArt ?? undefined,

  onPlaying(data, trackId, now) {
    const round = data.round;
    if (!round || round.state !== "guessing" || round.playingAt || round.trackId !== trackId) return false;
    round.playingAt = now;
    return true;
  },

  apply(game, data, roles, action, turn) {
    const round = data.round;
    const fail = (error: string, status: 400 | 403 = 400) => ({ ok: false as const, error, status });

    switch (action.type) {
      case "guess": {
        if (!roles.isOpponent) return fail("Du spielst nicht mit", 403);
        if (round?.state !== "guessing") return fail("Gerade wird nicht geschätzt");
        const deadline = guessDeadline(data);
        if (deadline && turn.ctx.now > deadline + GRACE_MS) return fail("Die Zeit ist abgelaufen");
        if (action.draft) {
          (round.drafts ??= {})[roles.actorId] = action.year;
          delete round.guesses[roles.actorId];
          break;
        }
        round.guesses[roles.actorId] = action.year;
        delete round.drafts?.[roles.actorId];
        // Everyone is done: reveal right away
        if (game.players.every(p => p.id in round.guesses)) {
          const error = reveal(game, data, turn);
          if (error) return fail(error);
        }
        break;
      }

      case "reveal": {
        if (!roles.isHost) return fail("Nur der Host darf auflösen", 403);
        if (round?.state !== "guessing") return fail("Gerade wird nicht geschätzt");
        const error = reveal(game, data, turn);
        if (error) return fail(error);
        break;
      }

      case "timeout": {
        if (!roles.isOpponent && !roles.isHost) return fail("Nicht im Spiel", 403);
        if (round?.state !== "guessing") return fail("Gerade wird nicht geschätzt");
        const deadline = guessDeadline(data);
        if (!deadline || turn.ctx.now < deadline - GRACE_MS) return fail("Die Zeit läuft noch");
        const error = reveal(game, data, turn);
        if (error) return fail(error);
        break;
      }

      case "next":
        if (!roles.mayContinue) return fail("Nur der Host darf weitermachen", 403);
        if (round?.state !== "revealed") return fail("Der Song ist noch nicht aufgelöst");
        turn.endTurn();
        break;
    }
    return { ok: true, effects: [] };
  },
};
