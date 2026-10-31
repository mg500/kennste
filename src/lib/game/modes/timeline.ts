import type { Game, Track } from "../types";
import { intIn } from "../validate";
import { playEffect } from "./play";
import type { GameMode, Turn } from "./types";

// ── Zeitstrahl: place songs in your timeline by release year ────────────────────

export interface TimelineCard {
  trackId: string;
  name: string;
  artist: string;
  year: number;
  albumArt: string | null;
}

export interface TimelineSettings {
  /** Face-up cards every player (or the team) starts with. */
  startCards: number;
  /** Seconds to place the song once it plays, 0 = no limit. */
  placeTimeLimit: number;
  /** Everyone builds one shared timeline and the team loses a life for every wrong card. */
  coop: boolean;
  /** Lives of the team in coop games. */
  lives: number;
  /** Start songs somewhere in the middle instead of the intro. */
  randomStart: boolean;
}

/** Key of the shared timeline in coop games. */
export const TEAM = "team";

export interface TimelineRound {
  /** listening: active player places the hidden song → revealed: result shown until "next" */
  state: "listening" | "revealed";
  /** Only the ID is public (for playback sync) — title and year stay on the server until revealed. */
  trackId: string;
  /** When Spotify actually started playing the song (set by the server) — the time limit runs from here. */
  playingAt?: number;
  /** Gap the active player is currently pointing at, shown live to everyone. */
  aim?: number | null;
  /** index = where the player placed it, null = time ran out */
  result?: { correct: boolean; index: number | null; card: TimelineCard };
  /** Coop: gaps the other players suggest (shown to everyone). */
  suggestions?: Record<string, number>;
}

export interface TimelineData {
  id: "timeline";
  settings: TimelineSettings;
  /** Each player's cards (in coop games the team's under TEAM), sorted by year. */
  timelines: Record<string, TimelineCard[]>;
  round?: TimelineRound;
  /** Coop: lives left. */
  livesLeft?: number;
  /** Placements per player (correct of total), for the final screen. */
  stats?: Record<string, { correct: number; total: number }>;
}

export type TimelineAction =
  | { type: "place"; index: number }
  | { type: "suggest"; index: number | null }
  | { type: "aim"; index: number | null }
  | { type: "timeout" }
  | { type: "redraw" }
  | { type: "next" };

/** Time limit tolerance for network delays. */
const GRACE_MS = 1000;

/** Deadline to place the current song, or null without limit / before playback started / once placed. */
export function placeDeadline(data: TimelineData): number | null {
  const limit = data.settings.placeTimeLimit;
  const round = data.round;
  return limit > 0 && round?.state === "listening" && round.playingAt ? round.playingAt + limit * 1000 : null;
}

/** Narrows a game's mode data to Zeitstrahl (UI code of this mode only runs for Zeitstrahl games). */
export function timelineData(game: { mode: { id: string } }): TimelineData {
  if (game.mode.id !== "timeline") throw new Error(`Expected timeline game, got ${game.mode.id}`);
  return game.mode as TimelineData;
}

/** Whose timeline a player plays on: their own, or the team's in coop games. */
export function timelineOf(data: TimelineData, playerId: string): TimelineCard[] {
  return data.timelines[data.settings.coop ? TEAM : playerId] ?? [];
}

/** Index where a card with `year` belongs in a sorted timeline. */
export function correctIndex(timeline: TimelineCard[], year: number): number {
  const i = timeline.findIndex(c => c.year > year);
  return i === -1 ? timeline.length : i;
}

export function cardOf(track: Track): TimelineCard | null {
  const year = Number(track.releaseYear?.slice(0, 4));
  if (!Number.isInteger(year) || year < 1800) return null;
  return { trackId: track.id, name: track.name, artist: track.artist, year, albumArt: track.albumArt };
}

/** True if a card with `year` fits between the neighbours at `index` (equal years fit on either side). */
export function fitsAt(timeline: TimelineCard[], index: number, year: number): boolean {
  const before = timeline[index - 1];
  const after = timeline[index];
  return (!before || before.year <= year) && (!after || year <= after.year);
}

/** Draws the next playlist track with a usable year that is in nobody's timeline yet. */
function drawCard(data: TimelineData, turn: Turn): { track: Track; card: TimelineCard } | null {
  const used = new Set(Object.values(data.timelines).flat().map(c => c.trackId));
  const total = turn.ctx.playlist?.length ?? 0;
  for (let i = 0; i < total; i++) {
    const track = turn.nextPlaylistTrack();
    if (!track) return null;
    const card = cardOf(track);
    if (card && !used.has(track.id)) return { track, card };
  }
  return null;
}

/** The song currently being placed, looked up server-side from the playlist. */
function currentTrack(game: Game, turn: Turn): Track | undefined {
  return game.playlistIndex === undefined ? undefined : turn.ctx.playlist?.[game.playlistIndex];
}

function startRound(data: TimelineData, turn: Turn) {
  const drawn = drawCard(data, turn);
  if (!drawn) { data.round = undefined; turn.outOfSongs(); return; }
  data.round = { state: "listening", trackId: drawn.track.id, aim: null, ...(data.settings.coop ? { suggestions: {} } : {}) };
  turn.effect(playEffect(drawn.track, data.settings.randomStart, turn.ctx.random));
}

/**
 * Resolves the active player's placement (`index` null = time ran out): the card joins the timeline
 * if it fits, otherwise it is lost — and in coop games so is a life.
 */
function settle(game: Game, data: TimelineData, playerId: string, card: TimelineCard, index: number | null, turn: Turn) {
  const coop = data.settings.coop;
  const timeline = data.timelines[coop ? TEAM : playerId] ?? [];
  const correct = index !== null && fitsAt(timeline, index, card.year);
  const before = index === null ? undefined : timeline[index - 1];
  const after = index === null ? undefined : timeline[index];
  const gap: [number, number] | undefined = correct && before && after ? [before.year, after.year] : undefined;
  const points = correct ? Object.fromEntries((coop ? game.players : [{ id: playerId }]).map(p => [p.id, 1])) : {};
  turn.record({
    song: { trackId: card.trackId, name: card.name, artist: card.artist, releaseYear: String(card.year), albumArt: card.albumArt },
    points, stats: { [playerId]: gap ? { gap } : {} },
  });
  if (correct) {
    timeline.splice(index, 0, card);
    data.timelines[coop ? TEAM : playerId] = timeline;
    for (const p of coop ? game.players : [{ id: playerId }]) turn.award(p.id, 1);
  } else if (coop) {
    data.livesLeft = Math.max(0, (data.livesLeft ?? 0) - 1);
  }
  const stats = (data.stats ??= {})[playerId] ??= { correct: 0, total: 0 };
  stats.total++;
  if (correct) stats.correct++;
  data.round!.state = "revealed";
  data.round!.result = { correct, index, card };
}

export const timeline: GameMode<TimelineData, TimelineAction> = {
  name: "Zeitstrahl",
  requiresPlaylist: true,
  scoreUnit: { one: "Karte", many: "Karten" },
  coreDefaults: { goal: "score", targetScore: 10, songSource: "playlist" },

  create() {
    return { id: "timeline", settings: { startCards: 1, placeTimeLimit: 0, coop: false, lives: 3, randomStart: false }, timelines: {} };
  },

  applySettings(data, patch, inLobby) {
    if (!inLobby) return;
    if (intIn(patch.startCards, 1, 3)) data.settings.startCards = patch.startCards;
    if (intIn(patch.placeTimeLimit, 0, 300)) data.settings.placeTimeLimit = patch.placeTimeLimit;
    if (typeof patch.coop === "boolean") data.settings.coop = patch.coop;
    if (intIn(patch.lives, 1, 5)) data.settings.lives = patch.lives;
    if (typeof patch.randomStart === "boolean") data.settings.randomStart = patch.randomStart;
  },

  parseAction(a) {
    switch (a.type) {
      case "next": case "redraw": case "timeout":
        return { type: a.type };
      case "aim": case "suggest":
        return a.index === null || (typeof a.index === "number" && Number.isInteger(a.index) && a.index >= 0 && a.index <= 200)
          ? { type: a.type, index: a.index as number | null } : null;
      case "place":
        return typeof a.index === "number" && Number.isInteger(a.index) && a.index >= 0 && a.index <= 200
          ? { type: a.type, index: a.index } : null;
      default:
        return null;
    }
  },

  startCards: (game, data) => data.settings.startCards * (data.settings.coop ? 1 : game.players.length),

  startTurn(game, data, turn) {
    // First turn of the game: deal the face-up start cards
    if (Object.keys(data.timelines).length === 0 && data.settings.coop) {
      const cards: TimelineCard[] = [];
      for (let i = 0; i < data.settings.startCards; i++) {
        const drawn = drawCard({ ...data, timelines: { [TEAM]: cards } }, turn);
        if (drawn) cards.push(drawn.card);
      }
      data.timelines[TEAM] = cards.sort((a, b) => a.year - b.year);
      // Everyone holds the team's score, so the card goal works as usual
      for (const player of game.players) turn.award(player.id, cards.length);
      data.livesLeft = data.settings.lives;
    } else if (Object.keys(data.timelines).length === 0) {
      for (const player of game.players) {
        const cards: TimelineCard[] = [];
        for (let i = 0; i < data.settings.startCards; i++) {
          const drawn = drawCard({ ...data, timelines: { ...data.timelines, [player.id]: cards } }, turn);
          if (drawn) cards.push(drawn.card);
        }
        data.timelines[player.id] = cards.sort((a, b) => a.year - b.year);
        turn.award(player.id, cards.length);
      }
    }
    startRound(data, turn);
  },

  clear(data) {
    data.timelines = {};
    data.round = undefined;
    data.livesLeft = undefined;
    data.stats = undefined;
  },

  teamResult(data) {
    if (!data.settings.coop) return null;
    const cards = data.timelines[TEAM]?.length ?? 0;
    const lives = data.livesLeft ?? 0;
    return lives > 0
      ? { won: true, title: "Geschafft!", subtitle: `${cards} Karten gemeinsam – mit ${lives} Leben übrig` }
      : { won: false, title: "Keine Leben mehr", subtitle: `${cards} Karten gemeinsam` };
  },

  deadline: placeDeadline,
  view(_game, data, _viewer, mask) {
    return data.round ? { ...data, round: { ...data.round, trackId: mask(data.round.trackId) } } : data;
  },
  currentTrackId: data => data.round?.trackId,
  usedTrackIds: data => [...Object.values(data.timelines).flat().map(c => c.trackId), ...(data.round ? [data.round.trackId] : [])],

  onPlaying(data, trackId, now) {
    const round = data.round;
    if (!round || round.state !== "listening" || round.playingAt || round.trackId !== trackId) return false;
    round.playingAt = now;
    return true;
  },
  currentCover: data => (data.round?.state === "revealed" ? data.round.result?.card.albumArt ?? undefined : undefined),

  apply(game, data, roles, action, turn) {
    const round = data.round;
    const fail = (error: string, status: 400 | 403 = 400) => ({ ok: false as const, error, status });

    switch (action.type) {
      case "place": {
        if (!roles.isActive) return fail("Du bist nicht dran", 403);
        if (round?.state !== "listening") return fail("Gerade gibt es nichts einzuordnen");
        const key = data.settings.coop ? TEAM : roles.actorId;
        const timeline = data.timelines[key] ?? [];
        if (action.index > timeline.length) return fail("Ungültige Position");
        const track = currentTrack(game, turn);
        const card = track?.id === round.trackId ? cardOf(track) : null;
        if (!card) return fail("Song nicht gefunden");
        const deadline = placeDeadline(data);
        if (deadline && turn.ctx.now > deadline + GRACE_MS) {
          settle(game, data, roles.actorId, card, null, turn);
          break;
        }
        settle(game, data, roles.actorId, card, action.index, turn);
        break;
      }

      case "aim":
        if (!roles.isActive) return fail("Du bist nicht dran", 403);
        if (round?.state !== "listening") return fail("Gerade gibt es nichts einzuordnen");
        if (action.index !== null && action.index > timelineOf(data, roles.actorId).length) return fail("Ungültige Position");
        round.aim = action.index;
        break;

      case "suggest":
        if (!data.settings.coop) return fail("Vorschläge gibt es nur im gemeinsamen Spiel");
        if (!roles.isOpponent) return fail("Du bist gerade dran", 403);
        if (round?.state !== "listening") return fail("Gerade gibt es nichts einzuordnen");
        if (action.index !== null && action.index > timelineOf(data, roles.actorId).length) return fail("Ungültige Position");
        round.suggestions ??= {};
        if (action.index === null) delete round.suggestions[roles.actorId];
        else round.suggestions[roles.actorId] = action.index;
        break;

      case "timeout": {
        if (!roles.isActive && !roles.isOpponent && !roles.isHost) return fail("Nicht im Spiel", 403);
        if (round?.state !== "listening") return fail("Gerade gibt es nichts einzuordnen");
        const deadline = placeDeadline(data);
        if (!deadline || turn.ctx.now < deadline - GRACE_MS) return fail("Die Zeit läuft noch");
        const track = currentTrack(game, turn);
        const card = track?.id === round.trackId ? cardOf(track) : null;
        if (!card) return fail("Song nicht gefunden");
        // The gap the active player picked last counts, as if they had placed the card there
        const active = game.players[game.currentPlayerIndex].id;
        const aim = round.aim ?? null;
        settle(game, data, active, card, aim !== null && aim <= timelineOf(data, active).length ? aim : null, turn);
        break;
      }

      case "redraw":
        // Song unknown to everyone or not playable: skip it without penalty
        if (!roles.isActive && !roles.isHost) return fail("Nur der aktuelle Spieler darf den Song tauschen", 403);
        if (round?.state !== "listening") return fail("Gerade läuft kein Song");
        startRound(data, turn);
        break;

      case "next":
        if (!roles.mayContinue) return fail("Nur wer als Nächstes dran ist, darf weitermachen", 403);
        if (round?.state !== "revealed") return fail("Der Song ist noch nicht eingeordnet");
        if (data.settings.coop && !data.livesLeft) turn.finishGame();
        else turn.endTurn();
        break;
    }
    return { ok: true, effects: [] };
  },
};
