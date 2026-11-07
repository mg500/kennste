import type { Effect, Game, RoundRecord, SongInfo, Track } from "../types";
import { intIn } from "../validate";
import { msSince, playedBefore, playEffect, recordedSong } from "./play";
import type { GameMode } from "./types";

// ── Alle gegen alle: everyone hears the same song, whoever buzzes first answers, judges themselves and the others confirm ──
// Everyone buzzes at most once per song: whoever buzzed has seen the solution, a second try would be a sure thing.

export interface VersusSettings {
  /** Seconds to answer after buzzing. */
  answerTime: number;
  /** Seconds until the song is revealed on its own, 0 = no limit. */
  playTimeLimit: number;
  /** Start songs somewhere in the middle instead of the intro. */
  randomStart: boolean;
}

export interface VersusRound {
  /**
   * playing: everyone may buzz → buzzed: one answers out loud, nobody sees the song yet → judging: only they see
   * the song and judge themselves → vote: they said "right", the song is shown and the others confirm → revealed
   */
  state: "playing" | "buzzed" | "judging" | "vote" | "revealed";
  /** Only the ID is public (for playback sync) — the song stays on the server until the vote or reveal. */
  trackId: string;
  /** When Spotify actually started playing the song (set by the server) — the time limit runs from here. */
  playingAt?: number;
  buzzedBy?: string;
  buzzedAt?: number;
  buzzCounts: Record<string, number>;
  /** Players who don't know the song (yet): they may still buzz, but once everyone else is done the song is revealed. */
  skipped: string[];
  /** Since when the buzzer sees the song and judges themselves. */
  judgingAt?: number;
  /** The others' votes on a "right": true = confirmed, false = rejected. */
  votes: Record<string, boolean>;
  /** How often each player judged themselves wrong in this song (for the awards). */
  selfWrong?: Record<string, number>;
  /** The song, once it may be shown to everyone (vote, revealed). */
  song?: SongInfo;
  /** Who got the point; `rejected`: the majority didn't confirm the "right". */
  result?: { winner?: string; rejected?: boolean };
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
  /** The buzzer has answered: show them the song before the time is up. */
  | { type: "answered" }
  | { type: "judge"; verdict: "correct" | "wrong" }
  /** One of the others on a "right"; null takes the vote back. */
  | { type: "vote"; confirm: boolean | null }
  /** The host settles a vote that doesn't come to an end. */
  | { type: "decide"; confirm: boolean }
  | { type: "reveal" }
  | { type: "timeout" }
  | { type: "next" };

/** How long the buzzer has to judge themselves once they see the song; afterwards it counts as wrong. */
export const JUDGE_MS = 20_000;
/** Time limit tolerance for network delays. */
const GRACE_MS = 1000;

/** Narrows a game's mode data to "Alle gegen alle" (UI code of this mode only runs for these games). */
export function versusData(game: { mode: { id: string } }): VersusData {
  if (game.mode.id !== "versus") throw new Error(`Expected versus game, got ${game.mode.id}`);
  return game.mode as VersusData;
}

/** Confirmations needed for a "right": more than half of the others. */
export function confirmsNeeded(game: Game): number {
  return Math.floor((game.players.length - 1) / 2) + 1;
}

/** When the current phase ends on its own: the song is revealed, the answer time is up, the buzzer didn't judge. The vote has no limit. */
export function versusDeadline(data: VersusData): number | null {
  const round = data.round;
  const s = data.settings;
  if (round?.state === "playing") return s.playTimeLimit > 0 && round.playingAt ? round.playingAt + s.playTimeLimit * 1000 : null;
  if (round?.state === "buzzed" && round.buzzedAt) return round.buzzedAt + s.answerTime * 1000;
  if (round?.state === "judging" && round.judgingAt) return round.judgingAt + JUDGE_MS;
  return null;
}

/** Whether the player buzzed in this song already (and saw the solution): they are out for this song. */
export const hasBuzzed = (round: VersusRound, playerId: string) => (round.buzzCounts[playerId] ?? 0) > 0;

/** Players who may still buzz in this song and haven't said they don't know it. */
export function canStillBuzz(game: Game, data: VersusData): string[] {
  const round = data.round;
  if (!round) return [];
  return game.players.map(p => p.id).filter(id => !round.skipped.includes(id) && !hasBuzzed(round, id));
}

function songOf(track: Track): SongInfo {
  return { name: track.name, artist: track.artist, releaseYear: track.releaseYear, albumArt: track.albumArt };
}

/** The song being played, looked up server-side from the playlist (its year may have been corrected meanwhile). */
export function currentTrack(game: Game, playlist: Track[] | undefined): Track | undefined {
  const track = game.playlistIndex === undefined ? undefined : playlist?.[game.playlistIndex];
  return track?.id === (game.mode as VersusData).round?.trackId ? track : undefined;
}

export const versus: GameMode<VersusData, VersusAction> = {
  name: "Buzzer · Alle gegen alle",
  requiresPlaylist: true,
  simultaneous: true,
  coreDefaults: { goal: "rounds", maxRounds: 10, songSource: "playlist" },

  create() {
    return {
      id: "versus",
      settings: { answerTime: 10, playTimeLimit: 45, randomStart: false },
      played: [],
    };
  },

  applySettings(data, patch, inLobby) {
    const s = data.settings;
    if (!inLobby) return;
    if (intIn(patch.answerTime, 3, 60)) s.answerTime = patch.answerTime;
    if (intIn(patch.playTimeLimit, 0, 300)) s.playTimeLimit = patch.playTimeLimit;
    if (typeof patch.randomStart === "boolean") s.randomStart = patch.randomStart;
  },

  parseAction(a) {
    switch (a.type) {
      case "buzz": case "skip": case "answered": case "reveal": case "next":
        return { type: a.type } as VersusAction;
      case "judge":
        return a.verdict === "correct" || a.verdict === "wrong" ? { type: a.type, verdict: a.verdict } : null;
      case "vote":
        return typeof a.confirm === "boolean" || a.confirm === null ? { type: a.type, confirm: a.confirm } : null;
      case "decide":
        return typeof a.confirm === "boolean" ? { type: a.type, confirm: a.confirm } : null;
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
    data.round = { state: "playing", trackId: track.id, buzzCounts: {}, skipped: [], votes: {} };
    turn.effect(playEffect(track, data.settings.randomStart, turn.ctx.random));
  },

  clear(data) {
    data.played = [];
    data.round = undefined;
  },

  deadline: versusDeadline,
  // The song itself only goes out once everyone may see it (`round.song`); the one judging asks for it (/answer)
  view(_game, data, _viewer, mask) {
    const round = data.round;
    if (!round) return data;
    return { ...data, played: playedBefore(data.played, round.trackId), round: { ...round, trackId: mask(round.trackId) } };
  },
  currentTrackId: data => data.round?.trackId,
  usedTrackIds: data => data.played,
  currentCover: data => data.round?.song?.albumArt ?? undefined,

  onPlaying(data, trackId, now) {
    const round = data.round;
    if (!round || round.playingAt || round.trackId !== trackId) return false;
    if (round.state !== "playing" && round.state !== "buzzed" && round.state !== "judging") return false;
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
    const now = turn.ctx.now;
    const effects: Effect[] = [];
    const fail = (error: string, status: 400 | 403 = 400) => ({ ok: false as const, error, status });
    const track = () => currentTrack(game, turn.ctx.playlist);
    const reveal = (r: VersusRound, result: VersusRound["result"] = {}) => {
      const t = track();
      if (t) r.song = songOf(t);
      r.state = "revealed";
      r.result = result;
      if (!t) return;
      const stats: RoundRecord["stats"] = {};
      for (const p of game.players) {
        const s: RoundRecord["stats"][string] = {};
        if (r.buzzCounts[p.id]) s.buzzes = r.buzzCounts[p.id];
        if (r.selfWrong?.[p.id]) s.selfWrong = r.selfWrong[p.id];
        if (r.votes[p.id] === false) s.votedNo = 1;
        if (result.winner === p.id) s.rightMs = msSince(r.playingAt, r.buzzedAt);
        stats[p.id] = s;
      }
      turn.record({ song: recordedSong(t), points: result.winner ? { [result.winner]: 1 } : {}, stats });
    };
    /** A wrong answer (or no answer in time): the song goes on for the others. */
    const wrong = (r: VersusRound) => {
      r.state = "playing";
      r.buzzedBy = undefined;
      r.buzzedAt = undefined;
      r.judgingAt = undefined;
      const deadline = versusDeadline(data);
      if (canStillBuzz(game, data).length === 0 || (deadline && now >= deadline)) reveal(r);
      else effects.push({ type: "play" });
    };

    /** The buzzer has answered: now they (and only they) see the song. */
    const judging = (r: VersusRound) => {
      r.state = "judging";
      r.judgingAt = now;
    };

    switch (action.type) {
      case "buzz": {
        if (!roles.isOpponent) return fail("Du spielst nicht mit", 403);
        if (round?.state !== "playing") return fail("Gerade kann niemand buzzern");
        if (hasBuzzed(round, roles.actorId)) return fail("Du hast bei diesem Song schon gebuzzert");
        // "Keine Ahnung" doesn't lock the buzzer: whoever remembers it after all may still buzz
        round.skipped = round.skipped.filter(id => id !== roles.actorId);
        round.state = "buzzed";
        round.buzzedBy = roles.actorId;
        round.buzzedAt = now;
        round.buzzCounts[roles.actorId] = 1;
        // The music pauses while someone answers
        effects.push({ type: "pause" });
        break;
      }

      case "skip":
        if (!roles.isOpponent) return fail("Du spielst nicht mit", 403);
        if (round?.state !== "playing") return fail("Gerade läuft kein Song");
        if (!round.skipped.includes(roles.actorId)) round.skipped.push(roles.actorId);
        if (canStillBuzz(game, data).length === 0) reveal(round);
        break;

      case "answered":
        if (round?.state !== "buzzed") return fail("Niemand hat gebuzzert");
        if (round.buzzedBy !== roles.actorId) return fail("Nur wer gebuzzert hat, antwortet", 403);
        judging(round);
        break;

      case "judge":
        if (round?.state !== "judging") return fail("Gerade wird nicht bewertet");
        if (round.buzzedBy !== roles.actorId) return fail("Nur wer gebuzzert hat, bewertet", 403);
        if (action.verdict === "wrong") {
          (round.selfWrong ??= {})[roles.actorId] = (round.selfWrong[roles.actorId] ?? 0) + 1;
          wrong(round);
          break;
        }
        // "Right": now everyone sees the song and the others confirm it – the music goes on meanwhile
        round.state = "vote";
        round.votes = {};
        { const t = track(); if (t) round.song = songOf(t); }
        effects.push({ type: "play" });
        if (game.players.length === 1) { turn.award(roles.actorId, 1); reveal(round, { winner: roles.actorId }); }
        break;

      case "vote": {
        if (round?.state !== "vote") return fail("Gerade wird nicht abgestimmt");
        if (!roles.isOpponent || roles.actorId === round.buzzedBy) return fail("Nur die anderen stimmen ab", 403);
        if (action.confirm === null) delete round.votes[roles.actorId];
        else round.votes[roles.actorId] = action.confirm;
        // Decided as soon as the outcome is certain
        const needed = confirmsNeeded(game);
        const votes = Object.values(round.votes);
        const others = game.players.filter(p => p.id !== round.buzzedBy).length;
        if (votes.filter(Boolean).length >= needed) { turn.award(round.buzzedBy!, 1); reveal(round, { winner: round.buzzedBy }); }
        else if (others - votes.filter(v => !v).length < needed) reveal(round, { rejected: true });
        break;
      }

      case "decide":
        if (!roles.isHost) return fail("Nur der Host darf entscheiden", 403);
        if (round?.state !== "vote") return fail("Gerade wird nicht abgestimmt");
        if (action.confirm) { turn.award(round.buzzedBy!, 1); reveal(round, { winner: round.buzzedBy }); }
        else reveal(round, { rejected: true });
        break;

      case "reveal":
        if (!roles.isHost) return fail("Nur der Host darf auflösen", 403);
        if (round?.state !== "playing" && round?.state !== "buzzed" && round?.state !== "judging") return fail("Gerade läuft kein Song");
        reveal(round);
        break;

      case "timeout": {
        if (!round) return fail("Gerade läuft kein Song");
        const deadline = versusDeadline(data);
        if (!deadline || now < deadline - GRACE_MS) return fail("Die Zeit läuft noch");
        if (round.state === "playing") reveal(round);
        else if (round.state === "buzzed") judging(round); // the time to answer is up: now they see the song
        else if (round.state === "judging") wrong(round); // didn't judge in time
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
