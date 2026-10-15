import type { Game, Track } from "../types";
import { playEffect } from "./play";
import type { GameMode, Turn } from "./types";

// ── Song-Tipp: everyone picks the right title or artist out of four ──────────

export type ChoiceField = "title" | "artist";

export interface ChoiceSettings {
  /** What is asked: title, artist or both alternating by round. */
  ask: ChoiceField | "mixed";
  /** Seconds to answer once the song plays, 0 = no limit. */
  answerTimeLimit: number;
  /** Start songs somewhere in the middle instead of the intro. */
  randomStart: boolean;
}

export interface ChoiceSong {
  name: string;
  artist: string;
  releaseYear?: string;
  albumArt: string | null;
}

export interface ChoiceRound {
  /** answering: everyone picks one option → revealed: result shown until the host continues */
  state: "answering" | "revealed";
  /** Only the ID is public (for playback sync) — which option is right stays on the server until revealed. */
  trackId: string;
  field: ChoiceField;
  options: string[];
  /** When Spotify actually started playing the song (set by the server) — times run from here. */
  playingAt?: number;
  /** Each player's answer (option index) and when it arrived. Answers are final. */
  answers: Record<string, { option: number; at: number }>;
  result?: { correct: number; song: ChoiceSong; points: Record<string, number>; fastest?: string };
}

export interface ChoiceData {
  id: "choice";
  settings: ChoiceSettings;
  /** Track IDs already played, so no song repeats within a game. */
  played: string[];
  round?: ChoiceRound;
}

export type ChoiceAction =
  | { type: "answer"; option: number }
  | { type: "reveal" }
  | { type: "timeout" }
  | { type: "next" };

export const OPTION_COUNT = 4;
export const POINTS_CORRECT = 2;
export const POINTS_FASTEST = 1;
/** Time limit tolerance for network delays. */
const GRACE_MS = 1000;

/** Narrows a game's mode data to Song-Tipp (UI code of this mode only runs for these games). */
export function choiceData(game: { mode: { id: string } }): ChoiceData {
  if (game.mode.id !== "choice") throw new Error(`Expected choice game, got ${game.mode.id}`);
  return game.mode as ChoiceData;
}

/** Deadline to answer, or null without limit / before playback started. */
export function answerDeadline(data: ChoiceData): number | null {
  const limit = data.settings.answerTimeLimit;
  return limit > 0 && data.round?.playingAt ? data.round.playingAt + limit * 1000 : null;
}

const labelOf = (track: Track, field: ChoiceField) => (field === "title" ? track.name : track.artist).trim();
const norm = (s: string) => s.toLocaleLowerCase("de");

/** Up to OPTION_COUNT labels: the right one plus distinct wrong ones from the rest of the playlist, shuffled. */
function buildOptions(track: Track, field: ChoiceField, playlist: Track[], random: () => number): string[] {
  const right = labelOf(track, field);
  const seen = new Set([norm(right)]);
  const pool = playlist.filter(t => t.id !== track.id).map(t => labelOf(t, field)).filter(Boolean);
  const wrong: string[] = [];
  // Random picks without repeats
  const rest = [...pool];
  while (wrong.length < OPTION_COUNT - 1 && rest.length) {
    const [label] = rest.splice(Math.floor(random() * rest.length), 1);
    if (!seen.has(norm(label))) { seen.add(norm(label)); wrong.push(label); }
  }
  const options = [right, ...wrong];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

function fieldFor(settings: ChoiceSettings, round: number): ChoiceField {
  return settings.ask === "mixed" ? (round % 2 === 1 ? "title" : "artist") : settings.ask;
}

/** The song currently in play, looked up server-side from the playlist. */
function currentTrack(game: Game, turn: Turn): Track | undefined {
  return game.playlistIndex === undefined ? undefined : turn.ctx.playlist?.[game.playlistIndex];
}

function reveal(game: Game, data: ChoiceData, turn: Turn): string | null {
  const round = data.round!;
  const track = currentTrack(game, turn);
  if (track?.id !== round.trackId) return "Song nicht gefunden";
  const correct = round.options.findIndex(o => norm(o) === norm(labelOf(track, round.field)));
  const points: Record<string, number> = {};
  let fastest: string | undefined;
  for (const [playerId, answer] of Object.entries(round.answers)) {
    if (answer.option !== correct) continue;
    points[playerId] = POINTS_CORRECT;
    if (!fastest || answer.at < round.answers[fastest].at) fastest = playerId;
  }
  if (fastest) points[fastest] += POINTS_FASTEST;
  for (const [playerId, p] of Object.entries(points)) turn.award(playerId, p);
  round.state = "revealed";
  round.result = {
    correct, points, fastest,
    song: { name: track.name, artist: track.artist, releaseYear: track.releaseYear, albumArt: track.albumArt },
  };
  return null;
}

export const choice: GameMode<ChoiceData, ChoiceAction> = {
  name: "Song-Tipp",
  requiresPlaylist: true,
  simultaneous: true,
  coreDefaults: { goal: "rounds", maxRounds: 10, songSource: "playlist" },

  create() {
    return { id: "choice", settings: { ask: "title", answerTimeLimit: 20, randomStart: false }, played: [] };
  },

  applySettings(data, patch, inLobby) {
    if (!inLobby) return;
    if (patch.ask === "title" || patch.ask === "artist" || patch.ask === "mixed") data.settings.ask = patch.ask;
    const v = patch.answerTimeLimit;
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 120) data.settings.answerTimeLimit = v;
    if (typeof patch.randomStart === "boolean") data.settings.randomStart = patch.randomStart;
  },

  parseAction(a) {
    switch (a.type) {
      case "reveal": case "timeout": case "next":
        return { type: a.type };
      case "answer":
        return typeof a.option === "number" && Number.isInteger(a.option) && a.option >= 0 && a.option < OPTION_COUNT
          ? { type: a.type, option: a.option } : null;
      default:
        return null;
    }
  },

  startTurn(game, data, turn) {
    const playlist = turn.ctx.playlist ?? [];
    let track: Track | null = null;
    for (let i = 0; i < playlist.length && !track; i++) {
      const next = turn.nextPlaylistTrack();
      if (!next) break;
      if (!data.played.includes(next.id)) track = next;
    }
    if (!track) { data.round = undefined; return; }
    const field = fieldFor(data.settings, game.currentRound);
    data.played.push(track.id);
    data.round = { state: "answering", trackId: track.id, field, options: buildOptions(track, field, playlist, turn.ctx.random), answers: {} };
    turn.effect(playEffect(track, data.settings.randomStart, turn.ctx.random));
  },

  clear(data) {
    data.played = [];
    data.round = undefined;
  },

  currentTrackId: data => data.round?.trackId,
  currentCover: data => data.round?.result?.song.albumArt ?? undefined,

  onPlaying(data, trackId, now) {
    const round = data.round;
    if (!round || round.state !== "answering" || round.playingAt || round.trackId !== trackId) return false;
    round.playingAt = now;
    return true;
  },

  apply(game, data, roles, action, turn) {
    const round = data.round;
    const fail = (error: string, status: 400 | 403 = 400) => ({ ok: false as const, error, status });
    const finish = () => {
      const error = reveal(game, data, turn);
      return error ? fail(error) : null;
    };

    switch (action.type) {
      case "answer": {
        if (!roles.isOpponent) return fail("Du spielst nicht mit", 403);
        if (round?.state !== "answering") return fail("Gerade wird nicht geraten");
        if (roles.actorId in round.answers) return fail("Du hast schon geantwortet");
        if (action.option >= round.options.length) return fail("Ungültige Antwort");
        const deadline = answerDeadline(data);
        if (deadline && turn.ctx.now > deadline + GRACE_MS) return fail("Die Zeit ist abgelaufen");
        round.answers[roles.actorId] = { option: action.option, at: turn.ctx.now };
        if (game.players.every(p => p.id in round.answers)) {
          const failed = finish();
          if (failed) return failed;
        }
        break;
      }

      case "reveal": {
        if (!roles.isHost) return fail("Nur der Host darf auflösen", 403);
        if (round?.state !== "answering") return fail("Gerade wird nicht geraten");
        const failed = finish();
        if (failed) return failed;
        break;
      }

      case "timeout": {
        if (!roles.isOpponent && !roles.isHost) return fail("Nicht im Spiel", 403);
        if (round?.state !== "answering") return fail("Gerade wird nicht geraten");
        const deadline = answerDeadline(data);
        if (!deadline || turn.ctx.now < deadline - GRACE_MS) return fail("Die Zeit läuft noch");
        const failed = finish();
        if (failed) return failed;
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
