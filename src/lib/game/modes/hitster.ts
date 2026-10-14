import type { Game, Track } from "../types";
import type { GameMode, Turn } from "./types";

// ── Hitster: place songs in your timeline by release year ────────────────────

export interface HitsterCard {
  trackId: string;
  name: string;
  artist: string;
  year: number;
  albumArt: string | null;
}

export interface HitsterSettings {
  /** Face-up cards every player starts with. */
  startCards: number;
  /** Seconds to place the song once it plays, 0 = no limit. */
  placeTimeLimit: number;
}

export interface HitsterRound {
  /** listening: active player places the hidden song → revealed: result shown until "next" */
  state: "listening" | "revealed";
  /** Only the ID is public (for playback sync) — title and year stay on the server until revealed. */
  trackId: string;
  /** When Spotify actually started playing the song (set by the server) — the time limit runs from here. */
  playingAt?: number;
  /** Gap the active player is currently pointing at, shown live to everyone. */
  aim?: number | null;
  /** index = where the player placed it, null = time ran out */
  result?: { correct: boolean; index: number | null; card: HitsterCard };
}

export interface HitsterData {
  id: "hitster";
  settings: HitsterSettings;
  /** Each player's cards, sorted by year. */
  timelines: Record<string, HitsterCard[]>;
  round?: HitsterRound;
}

export type HitsterAction =
  | { type: "place"; index: number }
  | { type: "aim"; index: number | null }
  | { type: "timeout" }
  | { type: "redraw" }
  | { type: "next" };

/** Time limit tolerance for network delays. */
const GRACE_MS = 1000;

/** Deadline to place the current song, or null without limit / before playback started. */
export function placeDeadline(data: HitsterData): number | null {
  const limit = data.settings.placeTimeLimit;
  return limit > 0 && data.round?.playingAt ? data.round.playingAt + limit * 1000 : null;
}

/** Narrows a game's mode data to Hitster (UI code of this mode only runs for Hitster games). */
export function hitsterData(game: { mode: { id: string } }): HitsterData {
  if (game.mode.id !== "hitster") throw new Error(`Expected hitster game, got ${game.mode.id}`);
  return game.mode as HitsterData;
}

/** Index where a card with `year` belongs in a sorted timeline. */
export function correctIndex(timeline: HitsterCard[], year: number): number {
  const i = timeline.findIndex(c => c.year > year);
  return i === -1 ? timeline.length : i;
}

export function cardOf(track: Track): HitsterCard | null {
  const year = Number(track.releaseYear?.slice(0, 4));
  if (!Number.isInteger(year) || year < 1800) return null;
  return { trackId: track.id, name: track.name, artist: track.artist, year, albumArt: track.albumArt };
}

/** True if a card with `year` fits between the neighbours at `index` (equal years fit on either side). */
export function fitsAt(timeline: HitsterCard[], index: number, year: number): boolean {
  const before = timeline[index - 1];
  const after = timeline[index];
  return (!before || before.year <= year) && (!after || year <= after.year);
}

/** Draws the next playlist track with a usable year that is in nobody's timeline yet. */
function drawCard(data: HitsterData, turn: Turn): { track: Track; card: HitsterCard } | null {
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

function startRound(data: HitsterData, turn: Turn) {
  const drawn = drawCard(data, turn);
  if (!drawn) { data.round = undefined; return; }
  data.round = { state: "listening", trackId: drawn.track.id, aim: null };
  turn.effect({ type: "play", trackId: drawn.track.id });
}

export const hitster: GameMode<HitsterData, HitsterAction> = {
  name: "Hitster",
  requiresPlaylist: true,
  scoreUnit: { one: "Karte", many: "Karten" },
  coreDefaults: { goal: "score", targetScore: 10, songSource: "playlist" },

  create() {
    return { id: "hitster", settings: { startCards: 1, placeTimeLimit: 0 }, timelines: {} };
  },

  applySettings(data, patch, inLobby) {
    if (!inLobby) return;
    const intIn = (v: unknown, min: number, max: number): v is number =>
      typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
    if (intIn(patch.startCards, 1, 3)) data.settings.startCards = patch.startCards;
    if (intIn(patch.placeTimeLimit, 0, 300)) data.settings.placeTimeLimit = patch.placeTimeLimit;
  },

  parseAction(a) {
    switch (a.type) {
      case "next": case "redraw": case "timeout":
        return { type: a.type };
      case "aim":
        return a.index === null || (typeof a.index === "number" && Number.isInteger(a.index) && a.index >= 0 && a.index <= 200)
          ? { type: a.type, index: a.index as number | null } : null;
      case "place":
        return typeof a.index === "number" && Number.isInteger(a.index) && a.index >= 0 && a.index <= 200
          ? { type: a.type, index: a.index } : null;
      default:
        return null;
    }
  },

  startTurn(game, data, turn) {
    // First turn of the game: deal the face-up start cards
    if (Object.keys(data.timelines).length === 0) {
      for (const player of game.players) {
        const cards: HitsterCard[] = [];
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
  },

  currentTrackId: data => data.round?.trackId,

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
        const timeline = data.timelines[roles.actorId] ?? [];
        if (action.index > timeline.length) return fail("Ungültige Position");
        const track = currentTrack(game, turn);
        const card = track?.id === round.trackId ? cardOf(track) : null;
        if (!card) return fail("Song nicht gefunden");
        const deadline = placeDeadline(data);
        if (deadline && turn.ctx.now > deadline + GRACE_MS) {
          round.state = "revealed";
          round.result = { correct: false, index: null, card };
          break;
        }
        const correct = fitsAt(timeline, action.index, card.year);
        if (correct) {
          timeline.splice(action.index, 0, card);
          data.timelines[roles.actorId] = timeline;
          turn.award(roles.actorId, 1);
        }
        round.state = "revealed";
        round.result = { correct, index: action.index, card };
        break;
      }

      case "aim":
        if (!roles.isActive) return fail("Du bist nicht dran", 403);
        if (round?.state !== "listening") return fail("Gerade gibt es nichts einzuordnen");
        if (action.index !== null && action.index > (data.timelines[roles.actorId]?.length ?? 0)) return fail("Ungültige Position");
        round.aim = action.index;
        break;

      case "timeout": {
        if (!roles.isActive && !roles.isOpponent && !roles.isHost) return fail("Nicht im Spiel", 403);
        if (round?.state !== "listening") return fail("Gerade gibt es nichts einzuordnen");
        const deadline = placeDeadline(data);
        if (!deadline || turn.ctx.now < deadline - GRACE_MS) return fail("Die Zeit läuft noch");
        const track = currentTrack(game, turn);
        const card = track?.id === round.trackId ? cardOf(track) : null;
        if (!card) return fail("Song nicht gefunden");
        round.state = "revealed";
        round.result = { correct: false, index: null, card };
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
        turn.endTurn();
        break;
    }
    return { ok: true, effects: [] };
  },
};
