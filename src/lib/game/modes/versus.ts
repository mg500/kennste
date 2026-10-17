import type { Effect, Game, SongInfo, Track } from "../types";
import { playEffect } from "./play";
import type { GameMode } from "./types";

// ── Alle gegen alle: everyone hears the same song, whoever buzzes first answers and judges themselves ──

export interface VersusSettings {
  /** Seconds to answer after buzzing. */
  answerTime: number;
  /** Buzzes per player and song. */
  buzzesPerSong: number;
  /** Seconds a player may not buzz again after a wrong answer. */
  cooldown: number;
  /** Seconds until the song is revealed on its own, 0 = no limit. */
  playTimeLimit: number;
  /** Pause the music while someone answers. */
  autoPauseOnBuzz: boolean;
  /** Start songs somewhere in the middle instead of the intro. */
  randomStart: boolean;
}

export interface VersusRound {
  /**
   * playing: everyone may buzz → buzzed: one answers and judges themselves (only they see the song) →
   * contest: they said "right", the song is shown and the others may object → revealed
   */
  state: "playing" | "buzzed" | "contest" | "revealed";
  /** Only the ID is public (for playback sync) — the song stays on the server until the contest or reveal. */
  trackId: string;
  /** When Spotify actually started playing the song (set by the server) — the time limit runs from here. */
  playingAt?: number;
  buzzedBy?: string;
  buzzedAt?: number;
  buzzCounts: Record<string, number>;
  /** Until when a player may not buzz again (after a wrong answer). */
  lockedUntil: Record<string, number>;
  /** Players who don't know the song. */
  skipped: string[];
  /** Since when the others may object to a "right" (contest). */
  claimAt?: number;
  /** Players objecting to the "right". */
  objections: string[];
  /** The song, once it may be shown to everyone (contest, revealed). */
  song?: SongInfo;
  /** Who got the point; `overruled`: the majority objected. */
  result?: { winner?: string; overruled?: boolean };
}

export interface VersusData {
  id: "versus";
  settings: VersusSettings;
  /** Track IDs already played, so no song repeats within a game. */
  played: string[];
  round?: VersusRound;
}

export type VersusAction =
  | { type: "buzz" }
  | { type: "skip" }
  | { type: "judge"; verdict: "correct" | "wrong" }
  | { type: "object"; want: boolean }
  | { type: "reveal" }
  | { type: "timeout" }
  | { type: "next" };

/** How long the others may object to a "right". */
export const CONTEST_MS = 5000;
/** Time limit tolerance for network delays. */
const GRACE_MS = 1000;

/** Narrows a game's mode data to "Alle gegen alle" (UI code of this mode only runs for these games). */
export function versusData(game: { mode: { id: string } }): VersusData {
  if (game.mode.id !== "versus") throw new Error(`Expected versus game, got ${game.mode.id}`);
  return game.mode as VersusData;
}

/** Objections needed to overrule a "right": more than half of the others. */
export function objectionsNeeded(game: Game): number {
  return Math.floor((game.players.length - 1) / 2) + 1;
}

/** When the current phase ends on its own: the song is revealed, the answer time is up, the contest is over. */
export function versusDeadline(data: VersusData): number | null {
  const round = data.round;
  const s = data.settings;
  if (round?.state === "playing") return s.playTimeLimit > 0 && round.playingAt ? round.playingAt + s.playTimeLimit * 1000 : null;
  if (round?.state === "buzzed" && round.buzzedAt) return round.buzzedAt + s.answerTime * 1000;
  if (round?.state === "contest" && round.claimAt) return round.claimAt + CONTEST_MS;
  return null;
}

/** Players who may still buzz in this song: not skipped and with buzzes left. */
export function canStillBuzz(game: Game, data: VersusData): string[] {
  const round = data.round;
  if (!round) return [];
  return game.players.map(p => p.id).filter(id => !round.skipped.includes(id) && (round.buzzCounts[id] ?? 0) < data.settings.buzzesPerSong);
}

function songOf(track: Track): SongInfo {
  return { name: track.name, artist: track.artist, releaseYear: track.releaseYear, albumArt: track.albumArt };
}

/** The song being played, looked up server-side from the playlist (its year may have been corrected meanwhile). */
export function currentTrack(game: Game, playlist: Track[] | undefined): Track | undefined {
  const track = game.playlistIndex === undefined ? undefined : playlist?.[game.playlistIndex];
  return track?.id === (game.mode as VersusData).round?.trackId ? track : undefined;
}

const intIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export const versus: GameMode<VersusData, VersusAction> = {
  name: "Alle gegen alle",
  requiresPlaylist: true,
  simultaneous: true,
  coreDefaults: { goal: "rounds", maxRounds: 10, songSource: "playlist" },

  create() {
    return {
      id: "versus",
      settings: { answerTime: 10, buzzesPerSong: 2, cooldown: 5, playTimeLimit: 45, autoPauseOnBuzz: true, randomStart: false },
      played: [],
    };
  },

  applySettings(data, patch, inLobby) {
    const s = data.settings;
    if (typeof patch.autoPauseOnBuzz === "boolean") s.autoPauseOnBuzz = patch.autoPauseOnBuzz;
    if (!inLobby) return;
    if (intIn(patch.answerTime, 3, 60)) s.answerTime = patch.answerTime;
    if (intIn(patch.buzzesPerSong, 1, 5)) s.buzzesPerSong = patch.buzzesPerSong;
    if (intIn(patch.cooldown, 0, 30)) s.cooldown = patch.cooldown;
    if (intIn(patch.playTimeLimit, 0, 300)) s.playTimeLimit = patch.playTimeLimit;
    if (typeof patch.randomStart === "boolean") s.randomStart = patch.randomStart;
  },

  parseAction(a) {
    switch (a.type) {
      case "buzz": case "skip": case "reveal": case "timeout": case "next":
        return { type: a.type };
      case "judge":
        return a.verdict === "correct" || a.verdict === "wrong" ? { type: a.type, verdict: a.verdict } : null;
      case "object":
        return typeof a.want === "boolean" ? { type: a.type, want: a.want } : null;
      default:
        return null;
    }
  },

  startTurn(_game, data, turn) {
    let track: Track | null = null;
    for (let i = 0; i < (turn.ctx.playlist?.length ?? 0); i++) {
      track = turn.nextPlaylistTrack();
      if (!track || !data.played.includes(track.id)) break;
    }
    if (!track) { data.round = undefined; turn.outOfSongs(); return; }
    data.played.push(track.id);
    data.round = { state: "playing", trackId: track.id, buzzCounts: {}, lockedUntil: {}, skipped: [], objections: [] };
    turn.effect(playEffect(track, data.settings.randomStart, turn.ctx.random));
  },

  clear(data) {
    data.played = [];
    data.round = undefined;
  },

  deadline: versusDeadline,
  currentTrackId: data => data.round?.trackId,
  currentCover: data => data.round?.song?.albumArt ?? undefined,

  onPlaying(data, trackId, now) {
    const round = data.round;
    if (!round || round.playingAt || round.trackId !== trackId) return false;
    if (round.state !== "playing" && round.state !== "buzzed") return false;
    round.playingAt = now;
    return true;
  },

  trackUpdated(data, track) {
    const round = data.round;
    if (round?.trackId !== track.id || !round.song || round.song.releaseYear === track.releaseYear) return false;
    round.song = { ...round.song, releaseYear: track.releaseYear };
    return true;
  },

  apply(game, data, roles, action, turn) {
    const round = data.round;
    const s = data.settings;
    const now = turn.ctx.now;
    const effects: Effect[] = [];
    const fail = (error: string, status: 400 | 403 = 400) => ({ ok: false as const, error, status });
    const track = () => currentTrack(game, turn.ctx.playlist);
    const reveal = (r: VersusRound, result: VersusRound["result"] = {}) => {
      const t = track();
      if (t) r.song = songOf(t);
      r.state = "revealed";
      r.result = result;
    };
    /** A wrong answer (or no answer in time): the song goes on, the player waits a moment before buzzing again. */
    const wrong = (r: VersusRound) => {
      if (r.buzzedBy) r.lockedUntil[r.buzzedBy] = now + s.cooldown * 1000;
      r.state = "playing";
      r.buzzedBy = undefined;
      r.buzzedAt = undefined;
      const deadline = versusDeadline(data);
      if (canStillBuzz(game, data).length === 0 || (deadline && now >= deadline)) reveal(r);
      else if (s.autoPauseOnBuzz) effects.push({ type: "play" });
    };

    switch (action.type) {
      case "buzz": {
        if (!roles.isOpponent) return fail("Du spielst nicht mit", 403);
        if (round?.state !== "playing") return fail("Gerade kann niemand buzzern");
        const count = round.buzzCounts[roles.actorId] ?? 0;
        if (count >= s.buzzesPerSong || round.skipped.includes(roles.actorId)) return fail("Keine Buzzer mehr übrig");
        if ((round.lockedUntil[roles.actorId] ?? 0) > now + GRACE_MS) return fail("Du bist noch kurz gesperrt");
        round.state = "buzzed";
        round.buzzedBy = roles.actorId;
        round.buzzedAt = now;
        round.buzzCounts[roles.actorId] = count + 1;
        if (s.autoPauseOnBuzz) effects.push({ type: "pause" });
        break;
      }

      case "skip":
        if (!roles.isOpponent) return fail("Du spielst nicht mit", 403);
        if (round?.state !== "playing") return fail("Gerade läuft kein Song");
        if (!round.skipped.includes(roles.actorId)) round.skipped.push(roles.actorId);
        if (canStillBuzz(game, data).length === 0) reveal(round);
        break;

      case "judge":
        if (round?.state !== "buzzed") return fail("Niemand hat gebuzzert");
        if (round.buzzedBy !== roles.actorId) return fail("Nur wer gebuzzert hat, bewertet", 403);
        if (action.verdict === "wrong") { wrong(round); break; }
        // "Right": now everyone sees the song and may object for a moment
        round.state = "contest";
        round.claimAt = now;
        round.objections = [];
        { const t = track(); if (t) round.song = songOf(t); }
        if (game.players.length === 1) { turn.award(roles.actorId, 1); reveal(round, { winner: roles.actorId }); }
        break;

      case "object": {
        if (round?.state !== "contest") return fail("Gerade gibt es nichts anzufechten");
        if (!roles.isOpponent || roles.actorId === round.buzzedBy) return fail("Nur die anderen können Einspruch erheben", 403);
        round.objections = round.objections.filter(id => id !== roles.actorId);
        if (action.want) round.objections.push(roles.actorId);
        // The majority objects: no point, on to the next song (everyone has seen the answer by now)
        if (round.objections.length >= objectionsNeeded(game)) reveal(round, { overruled: true });
        break;
      }

      case "reveal":
        if (!roles.isHost) return fail("Nur der Host darf auflösen", 403);
        if (round?.state !== "playing" && round?.state !== "buzzed") return fail("Gerade läuft kein Song");
        reveal(round);
        break;

      case "timeout": {
        if (!round) return fail("Gerade läuft kein Song");
        const deadline = versusDeadline(data);
        if (!deadline || now < deadline - GRACE_MS) return fail("Die Zeit läuft noch");
        if (round.state === "playing") reveal(round);
        else if (round.state === "buzzed") wrong(round); // no answer in time
        else if (round.state === "contest") { turn.award(round.buzzedBy!, 1); reveal(round, { winner: round.buzzedBy }); }
        break;
      }

      case "next":
        if (!roles.mayContinue) return fail("Nur der Host darf weitermachen", 403);
        if (round?.state !== "revealed") return fail("Der Song ist noch nicht aufgelöst");
        turn.endTurn();
        break;
    }
    return { ok: true, effects };
  },
};
