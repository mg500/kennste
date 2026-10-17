import type { Effect, Game, SongInfo, Track } from "../types";
import { playEffect } from "./play";
import type { GameMode } from "./types";

// ── Buzzer quiz: one player plays a song, the others buzz in and guess it ────

export type HintField = "cover" | "title" | "artist" | "year";
export const HINT_FIELDS: HintField[] = ["cover", "title", "artist", "year"];

export interface BuzzerSettings {
  autoPauseOnBuzz: boolean;
  hintsEnabled: Record<HintField, boolean>;
  maxBuzzesPerRound: number;
  buzzTimeLimit: number;  // seconds after buzz to answer, 0 = no limit
  playTimeLimit: number;  // seconds until the song is revealed on its own, 0 = no limit
  /** Start songs somewhere in the middle instead of at the intro. */
  randomStart: boolean;
  snippetLength: number;  // seconds a song plays before it is paused, 0 = whole song
}

export interface BuzzerRound {
  /** picking → playing ⇄ buzzed → revealed (result shown until the active player continues) */
  state: "picking" | "playing" | "buzzed" | "revealed";
  track?: Track;
  /** When Spotify actually started playing the song (set by the server) — timers start from here. */
  playingAt?: number;
  buzzedBy?: string;
  buzzedAt?: number;
  buzzCounts: Record<string, number>;
  skippedPlayers: string[];
  wrongPlayers: string[];
  revealed: Record<HintField, boolean>;
  /** The snippet length was reached and the song was paused. */
  snippetEnded?: boolean;
}

export interface GuessedSong {
  songName: string;
  artistName: string;
  albumArt?: string;
}

export interface LastResult {
  type: "correct" | "wrong" | "revealed";
  byPlayerId?: string;
  byPlayerName?: string;
  /** The song of the finished round (not set for "wrong", where the round continues). */
  song?: SongInfo;
}

export interface BuzzerData {
  id: "buzzer";
  settings: BuzzerSettings;
  round?: BuzzerRound;
  lastResult?: LastResult;
  guessedSongs: Record<string, GuessedSong[]>;
  /** Track IDs already played, so no song repeats within a game. */
  played: string[];
}

export type BuzzerAction =
  | { type: "pickSong"; track: Track }
  | { type: "buzz" }
  | { type: "skip" }
  | { type: "hint"; field: HintField }
  | { type: "judge"; verdict: "correct" | "wrong" }
  | { type: "reveal" }
  | { type: "timeout" }
  | { type: "next" };

/** Narrows a game's mode data to the buzzer quiz (UI code of this mode only runs for buzzer games). */
export function buzzerData(game: { mode: { id: string } }): BuzzerData {
  if (game.mode.id !== "buzzer") throw new Error(`Expected buzzer game, got ${game.mode.id}`);
  return game.mode as BuzzerData;
}

/** When the song is revealed on its own (playTimeLimit), or null without limit / before it plays / while someone buzzed. */
export function playDeadline(data: BuzzerData): number | null {
  const limit = data.settings.playTimeLimit;
  const round = data.round;
  return limit > 0 && round?.state === "playing" && round.playingAt ? round.playingAt + limit * 1000 : null;
}

/** Guessers who may still buzz: not skipped and with buzzes left. */
export function openGuessers(game: Game, data: BuzzerData): string[] {
  const round = data.round;
  if (!round) return [];
  const active = game.players[game.currentPlayerIndex]?.id;
  return game.players.map(p => p.id).filter(id =>
    id !== active && !round.skippedPlayers.includes(id) && (round.buzzCounts[id] ?? 0) < data.settings.maxBuzzesPerRound);
}

/** Time limit tolerance for network delays. */
const GRACE_MS = 1000;

const NOTHING_REVEALED: Record<HintField, boolean> = { cover: false, title: false, artist: false, year: false };

function newRound(track: Track | null): BuzzerRound {
  return {
    state: track ? "playing" : "picking",
    track: track ?? undefined,
    buzzCounts: {}, skippedPlayers: [], wrongPlayers: [],
    revealed: { ...NOTHING_REVEALED },
  };
}

function songOf(track: Track | undefined): SongInfo | undefined {
  return track && { name: track.name, artist: track.artist, releaseYear: track.releaseYear, albumArt: track.albumArt };
}

const intIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

// ── Input validation ─────────────────────────────────────────────────────────

const str = (v: unknown, max = 500): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const optStr = (v: unknown) => (typeof v === "string" ? v.slice(0, 500) : undefined);

export function parseTrack(v: unknown): Track | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  if (!str(t.id, 64) || !str(t.name) || typeof t.artist !== "string") return null;
  return {
    id: t.id, name: t.name, artist: t.artist.slice(0, 500),
    album: optStr(t.album), releaseYear: optStr(t.releaseYear),
    albumArt: optStr(t.albumArt) ?? null, previewUrl: optStr(t.previewUrl) ?? null,
    durationMs: intIn(t.durationMs, 1, 24 * 3600_000) ? t.durationMs : undefined,
  };
}

export const buzzer: GameMode<BuzzerData, BuzzerAction> = {
  name: "Buzzer-Quiz",

  create() {
    return {
      id: "buzzer",
      settings: {
        autoPauseOnBuzz: true,
        hintsEnabled: { cover: true, title: false, artist: true, year: true },
        maxBuzzesPerRound: 1, buzzTimeLimit: 10, playTimeLimit: 30,
        randomStart: false, snippetLength: 0,
      },
      guessedSongs: {},
      played: [],
    };
  },

  applySettings(data, patch, inLobby) {
    const s = data.settings;
    // Only the auto-pause switch may change while a game is running
    if (typeof patch.autoPauseOnBuzz === "boolean") s.autoPauseOnBuzz = patch.autoPauseOnBuzz;
    if (!inLobby) return;
    if (intIn(patch.maxBuzzesPerRound, 1, 5)) s.maxBuzzesPerRound = patch.maxBuzzesPerRound;
    if (intIn(patch.buzzTimeLimit, 0, 120)) s.buzzTimeLimit = patch.buzzTimeLimit;
    if (intIn(patch.playTimeLimit, 0, 300)) s.playTimeLimit = patch.playTimeLimit;
    if (typeof patch.randomStart === "boolean") s.randomStart = patch.randomStart;
    if (intIn(patch.snippetLength, 0, 60)) s.snippetLength = patch.snippetLength;
    const hints = patch.hintsEnabled;
    if (hints && typeof hints === "object") {
      for (const field of HINT_FIELDS) {
        const v = (hints as Record<string, unknown>)[field];
        if (typeof v === "boolean") s.hintsEnabled[field] = v;
      }
    }
  },

  parseAction(a) {
    switch (a.type) {
      case "buzz": case "skip": case "reveal": case "timeout": case "next":
        return { type: a.type };
      case "pickSong": {
        const track = parseTrack(a.track);
        return track ? { type: a.type, track } : null;
      }
      case "hint":
        return HINT_FIELDS.includes(a.field as HintField) ? { type: a.type, field: a.field as HintField } : null;
      case "judge":
        return a.verdict === "correct" || a.verdict === "wrong" ? { type: a.type, verdict: a.verdict } : null;
      default:
        return null;
    }
  },

  startTurn(game, data, turn) {
    const track = turn.nextPlaylistTrack();
    if (!track && game.settings.songSource === "playlist") { data.round = undefined; turn.outOfSongs(); return; }
    data.round = newRound(track);
    if (track) data.played.push(track.id);
    // Playlist songs start right away; timers start once Spotify actually plays (onPlaying)
    if (track) turn.effect(playEffect(track, data.settings.randomStart, turn.ctx.random));
  },

  onPlaying(data, trackId, now) {
    const round = data.round;
    if (!round || round.playingAt || round.track?.id !== trackId) return false;
    if (round.state !== "playing" && round.state !== "buzzed") return false;
    round.playingAt = now;
    return true;
  },

  playLimitMs: data => (data.settings.snippetLength ? data.settings.snippetLength * 1000 : undefined),

  onPlayLimit(data, trackId) {
    const round = data.round;
    if (!round || round.snippetEnded || round.track?.id !== trackId) return false;
    if (round.state !== "playing" && round.state !== "buzzed") return false;
    round.snippetEnded = true;
    return true;
  },

  clear(data) {
    data.round = undefined;
    data.lastResult = undefined;
    data.guessedSongs = {};
    data.played = [];
  },

  deadline: playDeadline,
  currentTrackId: data => data.round?.track?.id,
  currentCover: data => data.round?.track?.albumArt ?? undefined,

  apply(game, data, roles, action, turn) {
    const round = data.round;
    const s = data.settings;
    const effects: Effect[] = [];
    const fail = (error: string, status: 400 | 403 = 400) => ({ ok: false as const, error, status });
    const reveal = (r: BuzzerRound) => {
      data.lastResult = { type: "revealed", song: songOf(r.track) };
      r.state = "revealed";
    };
    /** Nobody can guess anymore (all skipped or out of buzzes) or the time ran out while someone buzzed: reveal. */
    const revealIfOver = (r: BuzzerRound) => {
      const deadline = playDeadline(data);
      if (openGuessers(game, data).length === 0 || (deadline && turn.ctx.now >= deadline)) reveal(r);
    };

    switch (action.type) {
      case "pickSong":
        if (!roles.isActive) return fail("Du bist nicht dran", 403);
        if (round?.state !== "picking") return fail("Gerade kann kein Song gewählt werden");
        if (game.settings.songSource === "playlist") return fail("Songs kommen aus der Playlist");
        if (data.played.includes(action.track.id)) return fail("Der Song lief schon in diesem Spiel");
        data.played.push(action.track.id);
        data.round = newRound(action.track);
        data.lastResult = undefined;
        effects.push(playEffect(action.track, s.randomStart, turn.ctx.random));
        break;

      case "buzz": {
        if (!roles.isOpponent) return fail("Du kannst gerade nicht buzzern", 403);
        if (round?.state !== "playing") return fail("Gerade läuft kein Song");
        const count = round.buzzCounts[roles.actorId] ?? 0;
        if (count >= s.maxBuzzesPerRound) return fail("Keine Buzzer mehr übrig");
        round.state = "buzzed";
        round.buzzedBy = roles.actorId;
        round.buzzedAt = turn.ctx.now;
        round.buzzCounts[roles.actorId] = count + 1;
        if (s.autoPauseOnBuzz) effects.push({ type: "pause" });
        break;
      }

      case "skip":
        if (!roles.isOpponent) return fail("Du kannst gerade nicht überspringen", 403);
        if (round?.state !== "playing") return fail("Gerade läuft kein Song");
        if (round.skippedPlayers.includes(roles.actorId)) return fail("Bereits übersprungen");
        round.skippedPlayers.push(roles.actorId);
        revealIfOver(round);
        break;

      case "hint":
        if (!roles.isActive) return fail("Nur der aktuelle Spieler darf Tipps geben", 403);
        if (round?.state !== "playing") return fail("Gerade läuft kein Song");
        if (!s.hintsEnabled[action.field]) return fail("Dieser Tipp ist deaktiviert");
        round.revealed[action.field] = true;
        break;

      case "judge": {
        if (!roles.isActive) return fail("Nur der aktuelle Spieler darf bewerten", 403);
        if (round?.state !== "buzzed" || !round.buzzedBy) return fail("Niemand hat gebuzzert");
        const buzzer = round.buzzedBy;
        const buzzerName = game.players.find(p => p.id === buzzer)?.name;
        if (action.verdict === "correct") {
          if (round.track) {
            (data.guessedSongs[buzzer] ??= []).push({
              songName: round.track.name, artistName: round.track.artist, albumArt: round.track.albumArt ?? undefined,
            });
          }
          data.lastResult = { type: "correct", byPlayerId: buzzer, byPlayerName: buzzerName, song: songOf(round.track) };
          turn.award(buzzer, 1);
          round.state = "revealed";
        } else {
          data.lastResult = { type: "wrong", byPlayerId: buzzer, byPlayerName: buzzerName };
          round.state = "playing";
          round.buzzedBy = undefined;
          round.wrongPlayers.push(buzzer);
          revealIfOver(round);
        }
        // Resume after the buzz pause — unless the snippet is already over
        if (s.autoPauseOnBuzz && !round.snippetEnded) effects.push({ type: "play" });
        break;
      }

      case "reveal":
        if (!roles.isActive) return fail("Nur der aktuelle Spieler darf auflösen", 403);
        if (round?.state !== "playing" && round?.state !== "buzzed") return fail("Gerade läuft kein Song");
        reveal(round);
        break;

      case "timeout": {
        if (round?.state !== "playing") return fail("Gerade läuft kein Song");
        const deadline = playDeadline(data);
        if (!deadline || turn.ctx.now < deadline - GRACE_MS) return fail("Die Zeit läuft noch");
        reveal(round);
        break;
      }

      case "next":
        if (!roles.mayContinue) return fail("Nur wer als Nächstes dran ist, darf weitermachen", 403);
        if (round?.state !== "revealed") return fail("Die Runde ist noch nicht aufgelöst");
        turn.endTurn();
        break;
    }
    return { ok: true, effects };
  },
};
