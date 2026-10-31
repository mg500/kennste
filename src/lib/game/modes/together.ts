import type { Game, Track } from "../types";
import { intIn } from "../validate";
import { onlyOwn, playedBefore, playEffect, recordedSong } from "./play";
import { cardOf, correctIndex, fitsAt, type TimelineCard } from "./timeline";
import type { GameMode, Turn } from "./types";

// ── Zeitstrahl für alle: everyone places the same song in one shared timeline at once ──

export interface TogetherSettings {
  /** Face-up cards the shared timeline starts with. */
  startCards: number;
  /** Seconds to place the song once it plays, 0 = no limit. */
  placeTimeLimit: number;
  /** Start songs somewhere in the middle instead of the intro. */
  randomStart: boolean;
}

export interface TogetherRound {
  /** placing: everyone picks a gap → revealed: result shown until the host continues */
  state: "placing" | "revealed";
  /** Only the ID is public (for playback sync) — title and year stay on the server until revealed. */
  trackId: string;
  /** When Spotify actually started playing the song (set by the server) — the time limit runs from here. */
  playingAt?: number;
  /** The gap each player picked last – counts when the time is up. Not shown to the others before the reveal. */
  picks: Record<string, number>;
  /** Players who pressed "Fertig". */
  done: string[];
  /** The card, where it belongs (in the timeline before it was added) and who got a point. */
  result?: { card: TimelineCard; index: number; points: Record<string, number> };
}

export interface TogetherData {
  id: "together";
  settings: TogetherSettings;
  /** The shared timeline, sorted by year. */
  timeline: TimelineCard[];
  /** Track IDs already played (in the timeline or not), so no song repeats within a game. */
  played: string[];
  round?: TogetherRound;
}

export type TogetherAction =
  | { type: "pick"; index: number; done?: boolean }
  | { type: "reveal" }
  | { type: "timeout" }
  | { type: "next" };

/** Time limit tolerance for network delays. */
const GRACE_MS = 1000;

/** Narrows a game's mode data to "Zeitstrahl für alle" (UI code of this mode only runs for these games). */
export function togetherData(game: { mode: { id: string } }): TogetherData {
  if (game.mode.id !== "together") throw new Error(`Expected together game, got ${game.mode.id}`);
  return game.mode as TogetherData;
}

/** Deadline to place, or null without limit / before playback started / after the reveal. */
export function placeDeadline(data: TogetherData): number | null {
  const limit = data.settings.placeTimeLimit;
  const round = data.round;
  return limit > 0 && round?.state === "placing" && round.playingAt ? round.playingAt + limit * 1000 : null;
}

/** Draws the next playlist track with a usable year that was not played yet. */
function draw(data: TogetherData, turn: Turn): { track: Track; card: TimelineCard } | null {
  const total = turn.ctx.playlist?.length ?? 0;
  for (let i = 0; i < total; i++) {
    const track = turn.nextPlaylistTrack();
    if (!track) return null;
    const card = cardOf(track);
    if (card && !data.played.includes(track.id)) return { track, card };
  }
  return null;
}

/** The song currently being placed, looked up server-side from the playlist (its year may have been corrected meanwhile). */
function currentTrack(game: Game, turn: Turn): Track | undefined {
  return game.playlistIndex === undefined ? undefined : turn.ctx.playlist?.[game.playlistIndex];
}

function reveal(game: Game, data: TogetherData, turn: Turn): string | null {
  const round = data.round!;
  const track = currentTrack(game, turn);
  const card = track?.id === round.trackId ? cardOf(track) : null;
  if (!card) return "Song nicht gefunden";
  const points: Record<string, number> = {};
  for (const [playerId, index] of Object.entries(round.picks)) {
    if (!game.players.some(p => p.id === playerId) || !fitsAt(data.timeline, index, card.year)) continue;
    points[playerId] = 1;
    turn.award(playerId, 1);
  }
  const index = correctIndex(data.timeline, card.year);
  const gapOf = (i: number): [number, number] | undefined =>
    data.timeline[i - 1] && data.timeline[i] ? [data.timeline[i - 1].year, data.timeline[i].year] : undefined;
  turn.record({
    song: recordedSong(track!), points,
    stats: Object.fromEntries(game.players.map(p => {
      const gap = points[p.id] ? gapOf(round.picks[p.id]) : undefined;
      return [p.id, gap ? { gap } : {}];
    })),
  });
  round.result = { card, index, points };
  round.state = "revealed";
  data.timeline.splice(index, 0, card);
  return null;
}

export const together: GameMode<TogetherData, TogetherAction> = {
  name: "Zeitstrahl · Alle gleichzeitig",
  requiresPlaylist: true,
  simultaneous: true,
  coreDefaults: { goal: "rounds", maxRounds: 10, songSource: "playlist" },

  create() {
    return { id: "together", settings: { startCards: 2, placeTimeLimit: 30, randomStart: false }, timeline: [], played: [] };
  },

  startCards: (_game, data) => data.settings.startCards,

  applySettings(data, patch, inLobby) {
    if (!inLobby) return;
    if (intIn(patch.startCards, 1, 5)) data.settings.startCards = patch.startCards;
    if (intIn(patch.placeTimeLimit, 0, 300)) data.settings.placeTimeLimit = patch.placeTimeLimit;
    if (typeof patch.randomStart === "boolean") data.settings.randomStart = patch.randomStart;
  },

  parseAction(a) {
    switch (a.type) {
      case "reveal": case "next":
        return { type: a.type };
      case "pick":
        return typeof a.index === "number" && Number.isInteger(a.index) && a.index >= 0 && a.index <= 500
          ? { type: a.type, index: a.index, ...(a.done === true ? { done: true } : {}) } : null;
      default:
        return null;
    }
  },

  startTurn(_game, data, turn) {
    // The first round lays out the face-up start cards
    while (data.timeline.length < data.settings.startCards) {
      const start = draw(data, turn);
      if (!start) break;
      data.played.push(start.track.id);
      data.timeline.splice(correctIndex(data.timeline, start.card.year), 0, start.card);
    }
    const drawn = draw(data, turn);
    if (!drawn) { data.round = undefined; turn.outOfSongs(); return; }
    data.played.push(drawn.track.id);
    data.round = { state: "placing", trackId: drawn.track.id, picks: {}, done: [] };
    turn.effect(playEffect(drawn.track, data.settings.randomStart, turn.ctx.random));
  },

  clear(data) {
    data.timeline = [];
    data.played = [];
    data.round = undefined;
  },

  deadline: placeDeadline,
  view(_game, data, viewer, mask) {
    const round = data.round;
    if (!round) return data;
    // While placing, everyone only sees their own gap (who is done is in `done`)
    const picks = round.state === "placing" ? onlyOwn(round.picks, viewer) : round.picks;
    return { ...data, played: playedBefore(data.played, round.trackId), round: { ...round, trackId: mask(round.trackId), picks } };
  },
  currentTrackId: data => data.round?.trackId,
  usedTrackIds: data => data.played,
  currentCover: data => data.round?.result?.card.albumArt ?? undefined,

  onPlaying(data, trackId, now) {
    const round = data.round;
    if (!round || round.state !== "placing" || round.playingAt || round.trackId !== trackId) return false;
    round.playingAt = now;
    return true;
  },

  apply(game, data, roles, action, turn) {
    const round = data.round;
    const fail = (error: string, status: 400 | 403 = 400) => ({ ok: false as const, error, status });

    switch (action.type) {
      case "pick": {
        if (!roles.isOpponent) return fail("Du spielst nicht mit", 403);
        if (round?.state !== "placing") return fail("Gerade wird nicht gelegt");
        if (action.index > data.timeline.length) return fail("Ungültige Lücke");
        const deadline = placeDeadline(data);
        if (deadline && turn.ctx.now > deadline + GRACE_MS) return fail("Die Zeit ist abgelaufen");
        round.picks[roles.actorId] = action.index;
        round.done = round.done.filter(id => id !== roles.actorId);
        if (action.done) round.done.push(roles.actorId);
        // Everyone is done: reveal right away
        if (game.players.every(p => round.done.includes(p.id))) {
          const error = reveal(game, data, turn);
          if (error) return fail(error);
        }
        break;
      }

      case "reveal": {
        if (!roles.isHost) return fail("Nur der Host darf auflösen", 403);
        if (round?.state !== "placing") return fail("Gerade wird nicht gelegt");
        const error = reveal(game, data, turn);
        if (error) return fail(error);
        break;
      }

      case "timeout": {
        if (round?.state !== "placing") return fail("Gerade wird nicht gelegt");
        const deadline = placeDeadline(data);
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
