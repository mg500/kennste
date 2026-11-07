import type { Game, PlayerRoundStats, RoundRecord } from "./types";

// ── Awards and the song list at the end of a game, computed from `game.history` ──

export type AwardId =
  | "fast" | "streak" | "comeback" | "brave" | "honest" | "jury" | "dj"
  | "bullseye" | "close" | "timeTraveler" | "first" | "boldGap";

export interface Award {
  id: AwardId;
  title: string;
  /** Who gets it – everyone tied for it. */
  playerIds: string[];
  /** What they did, e.g. "3 Songs in Folge richtig". */
  fact: string;
}

/** At most this many awards, in the order of `ORDER`. */
export const MAX_AWARDS = 5;

const ORDER: AwardId[] = ["fast", "streak", "bullseye", "boldGap", "brave", "honest", "jury", "first", "close", "comeback", "dj", "timeTraveler"];

/** Which awards a mode can hand out (the ones that match what the mode records). */
const BY_MODE: Record<Game["mode"]["id"], AwardId[]> = {
  buzzer: ["fast", "streak", "brave", "dj", "comeback"],
  versus: ["fast", "streak", "brave", "honest", "jury", "comeback"],
  year: ["bullseye", "close", "timeTraveler", "first", "streak", "comeback"],
  choice: ["fast", "first", "streak", "comeback"],
  timeline: ["streak", "boldGap", "comeback"],
  together: ["streak", "boldGap", "first", "comeback"],
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
const times = (n: number) => `${n}×`;

/** The players with the highest value (at least `min`), or none. */
function best(values: Map<string, number>, min: number, lowest = false): { ids: string[]; value: number } | null {
  const valid = [...values].filter(([, v]) => (lowest ? v <= min : v >= min));
  if (!valid.length) return null;
  const value = lowest ? Math.min(...valid.map(([, v]) => v)) : Math.max(...valid.map(([, v]) => v));
  return { ids: valid.filter(([, v]) => v === value).map(([id]) => id), value };
}

function sum(history: RoundRecord[], pick: (s: PlayerRoundStats) => number | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of history) for (const [id, s] of Object.entries(r.stats)) {
    const v = pick(s);
    if (v) out.set(id, (out.get(id) ?? 0) + v);
  }
  return out;
}

/** Longest run of rounds with points, counting only the rounds someone took part in. */
function streaks(history: RoundRecord[]): Map<string, number> {
  const current = new Map<string, number>();
  const longest = new Map<string, number>();
  for (const r of history) for (const id of Object.keys(r.stats)) {
    const run = r.points[id] ? (current.get(id) ?? 0) + 1 : 0;
    current.set(id, run);
    longest.set(id, Math.max(longest.get(id) ?? 0, run));
  }
  return longest;
}

/** Places gained from the worst place after the first round to the final place (ties share a place). */
function comebacks(game: Game, history: RoundRecord[]): Map<string, number> {
  const ids = game.players.map(p => p.id);
  const totals = new Map(ids.map(id => [id, 0]));
  const placeOf = (id: string) => 1 + ids.filter(o => totals.get(o)! > totals.get(id)!).length;
  const worst = new Map(ids.map(id => [id, 1]));
  history.forEach((r, i) => {
    for (const [id, p] of Object.entries(r.points)) if (totals.has(id)) totals.set(id, totals.get(id)! + p);
    if (i > 0) for (const id of ids) worst.set(id, Math.max(worst.get(id)!, placeOf(id)));
  });
  return new Map(ids.map(id => [id, worst.get(id)! - placeOf(id)]));
}

/** The awards of a finished game, at most `MAX_AWARDS`. Every award needs a real achievement, ties share it. */
export function computeAwards(game: Game): Award[] {
  const history = game.history ?? [];
  if (!history.length) return [];
  const mode = game.mode.id;
  const allowed = new Set(BY_MODE[mode]);
  const timelineMode = mode === "timeline" || mode === "together";
  const awards: Award[] = [];
  const add = (id: AwardId, title: string, found: { ids: string[]; value: number } | null, fact: (v: number) => string) => {
    if (allowed.has(id) && found) awards.push({ id, title, playerIds: found.ids, fact: fact(found.value) });
  };

  // Fastest right answer, with the song
  const fastest = history.flatMap(r => Object.entries(r.stats)
    .filter(([, s]) => s.rightMs !== undefined).map(([id, s]) => ({ id, ms: s.rightMs!, song: r.song.name })));
  if (fastest.length) {
    const ms = Math.min(...fastest.map(f => f.ms));
    const winners = fastest.filter(f => f.ms === ms);
    add("fast", "Blitzmerker", { ids: [...new Set(winners.map(f => f.id))], value: ms }, v => `„${winners[0].song}“ nach ${seconds(v)} erkannt`);
  }
  add("streak", timelineMode ? "Sicher gelegt" : "Serie", best(streaks(history), 3),
    v => timelineMode ? `${v} Karten in Folge richtig` : `${v} Songs in Folge richtig`);
  add("bullseye", "Volltreffer", best(sum(history, s => (s.yearsOff === 0 ? 1 : 0)), 1), v => (v === 1 ? "Ein Jahr exakt getroffen" : `${v} Jahre exakt getroffen`));
  add("close", "Knapp daneben", best(sum(history, s => (s.yearsOff === 1 ? 1 : 0)), 2), v => `${times(v)} nur ein Jahr daneben`);
  {
    const off = new Map<string, number[]>();
    for (const r of history) for (const [id, s] of Object.entries(r.stats)) if (s.yearsOff !== undefined) off.set(id, [...(off.get(id) ?? []), s.yearsOff]);
    const avg = new Map([...off].filter(([, v]) => v.length >= 3).map(([id, v]) => [id, v.reduce((a, b) => a + b, 0) / v.length]));
    add("timeTraveler", "Zeitreisender", best(avg, 6), v => `Im Schnitt ${Math.round(v)} Jahre daneben`);
  }
  {
    const gaps = history.flatMap(r => Object.entries(r.stats).filter(([, s]) => s.gap).map(([id, s]) => ({ id, gap: s.gap! })));
    if (gaps.length) {
      const width = Math.min(...gaps.map(g => g.gap[1] - g.gap[0]));
      const winners = gaps.filter(g => g.gap[1] - g.gap[0] === width);
      if (width <= 3) add("boldGap", "Mutige Lücke", { ids: [...new Set(winners.map(g => g.id))], value: width }, () => `Richtig zwischen ${winners[0].gap[0]} und ${winners[0].gap[1]}`);
    }
  }
  {
    const buzzes = sum(history, s => s.buzzes);
    const right = new Map<string, number>();
    for (const r of history) for (const id of Object.keys(r.points)) if (r.points[id] > 0 && r.stats[id]?.buzzes) right.set(id, (right.get(id) ?? 0) + 1);
    add("brave", "Mutig", best(buzzes, 4), v => `${times(v)} gebuzzert`);
    const brave = awards.find(a => a.id === "brave");
    if (brave?.playerIds.length === 1) brave.fact += `, ${times(right.get(brave.playerIds[0]) ?? 0)} richtig`;
  }
  add("honest", "Ehrlich", best(sum(history, s => s.selfWrong), 2), v => `Sich ${times(v)} selbst „falsch“ gegeben`);
  add("jury", "Strenge Jury", best(sum(history, s => s.votedNo), 2), v => `${times(v)} „Stimmt nicht“ gestimmt`);
  add("first", "Immer zuerst", best(sum(history, s => (s.fastest ? 1 : 0)), 2), v => `${times(v)} am schnellsten richtig`);
  {
    const unguessed = new Map<string, number>();
    for (const r of history) if (r.pickedBy && !Object.values(r.points).some(Boolean)) unguessed.set(r.pickedBy, (unguessed.get(r.pickedBy) ?? 0) + 1);
    add("dj", "DJ", best(unguessed, 2), v => `${v} Songs, die keiner erkannt hat`);
  }
  if (game.players.length >= 3) add("comeback", "Aufholjagd", best(comebacks(game, history), 2), v => `${v} Plätze nach vorn`);

  return awards.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)).slice(0, MAX_AWARDS);
}

/** Every song of the game in order, with who scored on it. */
export function playedSongs(game: Game): { song: RoundRecord["song"]; scorers: string[] }[] {
  const seen = new Set<string>();
  const out: { song: RoundRecord["song"]; scorers: string[] }[] = [];
  for (const r of game.history ?? []) {
    if (seen.has(r.song.trackId)) continue;
    seen.add(r.song.trackId);
    out.push({ song: r.song, scorers: Object.keys(r.points).filter(id => r.points[id] > 0) });
  }
  return out;
}
