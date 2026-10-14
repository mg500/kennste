import type { Effect, SongInfo, Track } from "../types";
import type { GameMode } from "./types";

// ── Buzzer quiz: one player plays a song, the others buzz in and guess it ────

export type HintField = "cover" | "title" | "artist" | "year";
export const HINT_FIELDS: HintField[] = ["cover", "title", "artist", "year"];

export interface BuzzerSettings {
  autoPauseOnBuzz: boolean;
  hintsEnabled: Record<HintField, boolean>;
  maxBuzzesPerRound: number;
  buzzTimeLimit: number;  // seconds after buzz to answer, 0 = no limit
  playTimeLimit: number;  // seconds before the active player can reveal, 0 = no limit
}

export interface BuzzerRound {
  state: "picking" | "playing" | "buzzed";
  track?: Track;
  playingAt?: number;
  buzzedBy?: string;
  buzzedAt?: number;
  buzzCounts: Record<string, number>;
  skippedPlayers: string[];
  wrongPlayers: string[];
  revealed: Record<HintField, boolean>;
}

export interface GuessedSong {
  songName: string;
  artistName: string;
  albumArt?: string;
}

export interface LastResult {
  type: "correct" | "wrong" | "revealed";
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
}

export type BuzzerAction =
  | { type: "pickSong"; track: Track }
  | { type: "buzz" }
  | { type: "skip" }
  | { type: "hint"; field: HintField }
  | { type: "judge"; verdict: "correct" | "wrong" }
  | { type: "reveal" };

const NOTHING_REVEALED: Record<HintField, boolean> = { cover: false, title: false, artist: false, year: false };

function newRound(track: Track | null, now: number): BuzzerRound {
  return {
    state: track ? "playing" : "picking",
    track: track ?? undefined,
    playingAt: track ? now : undefined,
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
      },
      guessedSongs: {},
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
      case "buzz": case "skip": case "reveal":
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

  startTurn(_game, data, turn) {
    data.round = newRound(turn.nextPlaylistTrack(), turn.ctx.now);
  },

  clear(data) {
    data.round = undefined;
    data.lastResult = undefined;
    data.guessedSongs = {};
  },

  currentTrackId: data => data.round?.track?.id,
  currentCover: data => data.round?.track?.albumArt ?? undefined,

  apply(game, data, roles, action, turn) {
    const round = data.round;
    const s = data.settings;
    const effects: Effect[] = [];
    const fail = (error: string, status: 400 | 403 = 400) => ({ ok: false as const, error, status });

    switch (action.type) {
      case "pickSong":
        if (!roles.isActive) return fail("Du bist nicht dran", 403);
        if (round?.state !== "picking") return fail("Gerade kann kein Song gewählt werden");
        if (game.settings.songSource === "playlist") return fail("Songs kommen aus der Playlist");
        data.round = newRound(action.track, turn.ctx.now);
        data.lastResult = undefined;
        effects.push({ type: "play", trackId: action.track.id });
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
          data.lastResult = { type: "correct", byPlayerName: buzzerName, song: songOf(round.track) };
          if (!turn.award(buzzer, 1)) turn.endTurn();
        } else {
          data.lastResult = { type: "wrong", byPlayerName: buzzerName };
          round.state = "playing";
          round.buzzedBy = undefined;
          round.wrongPlayers.push(buzzer);
        }
        if (s.autoPauseOnBuzz) effects.push({ type: "play" });
        break;
      }

      case "reveal":
        if (!roles.isActive) return fail("Nur der aktuelle Spieler darf auflösen", 403);
        if (round?.state !== "playing" && round?.state !== "buzzed") return fail("Gerade läuft kein Song");
        data.lastResult = { type: "revealed", song: songOf(round.track) };
        turn.endTurn();
        break;
    }
    return { ok: true, effects };
  },
};
