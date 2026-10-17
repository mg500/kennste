import { describe, expect, it } from "vitest";
import { addPlayer, applyAction, newGame, parseAction, type Context } from "../reducer";
import type { Action, Game, Track } from "../types";
import { fitsAt, timeline, TEAM, type TimelineCard, type TimelineData } from "./timeline";

const track = (id: string, year: number): Track => ({ id, name: `Song ${id}`, artist: `Artist ${id}`, releaseYear: String(year), albumArt: null, previewUrl: null });
// Deck in playlist order: h's start card, a's start card, then the songs to place
const playlist = [track("s1", 1980), track("s2", 2000), track("p1", 1990), track("p2", 1970), track("p3", 2010), track("p4", 1995)];
const ctx = (extra: Partial<Context> = {}): Context => ({ now: 1000, random: () => 0, playlist, ...extra });

const timelineDataOf = (g: Game) => {
  if (g.mode.id !== "timeline") throw new Error("not timeline");
  return g.mode as TimelineData;
};

function act(game: Game, actor: string, action: Action, c = ctx()) {
  const r = applyAction(game, actor, action, c);
  if (!r.ok) throw new Error(`${action.type} by ${actor} failed: ${r.error}`);
  return r;
}

function started(targetScore = 10, placeTimeLimit = 0): Game {
  let g = newGame("g1", 0);
  for (const [i, id] of ["h", "a"].entries()) g = addPlayer(g, { id, name: id.toUpperCase(), joinedAt: i })!;
  g = act(g, "h", { type: "setMode", mode: "timeline" }).game;
  g = act(g, "h", { type: "updateSettings", patch: { targetScore } }).game;
  g = act(g, "h", { type: "updateModeSettings", patch: { placeTimeLimit } }).game;
  return act(g, "h", { type: "start" }).game;
}

/** Simulates the server noticing that Spotify plays the current song at `now`. */
function playing(g: Game, now: number): Game {
  const data = structuredClone(timelineDataOf(g));
  timeline.onPlaying!(data, data.round!.trackId, now);
  return { ...g, mode: data };
}

describe("fitsAt", () => {
  const timeline: TimelineCard[] = [1970, 1990].map(year => ({ trackId: String(year), name: "", artist: "", year, albumArt: null }));
  it("accepts positions between the neighbours, equal years on either side", () => {
    expect(fitsAt(timeline, 0, 1960)).toBe(true);
    expect(fitsAt(timeline, 1, 1980)).toBe(true);
    expect(fitsAt(timeline, 2, 2000)).toBe(true);
    expect(fitsAt(timeline, 0, 1970)).toBe(true);
    expect(fitsAt(timeline, 1, 1970)).toBe(true);
    expect(fitsAt(timeline, 0, 1980)).toBe(false);
    expect(fitsAt(timeline, 2, 1985)).toBe(false);
  });
});

describe("timeline", () => {
  it("selecting the mode switches to playlist songs and a card goal", () => {
    let g = newGame("g1", 0);
    g = addPlayer(g, { id: "h", name: "H", joinedAt: 0 })!;
    g = act(g, "h", { type: "setMode", mode: "timeline" }).game;
    expect(g.settings).toMatchObject({ songSource: "playlist", goal: "score", targetScore: 10 });
    g = act(g, "h", { type: "updateSettings", patch: { songSource: "players" } }).game;
    expect(g.settings.songSource).toBe("playlist");
    expect(applyAction(g, "h", { type: "start" }, ctx({ playlist: [] })).ok).toBe(false);
  });

  it("deals a start card to everyone and plays the first song", () => {
    let g = newGame("g1", 0);
    for (const [i, id] of ["h", "a"].entries()) g = addPlayer(g, { id, name: id, joinedAt: i })!;
    g = act(g, "h", { type: "setMode", mode: "timeline" }).game;
    const r = act(g, "h", { type: "start" });
    const data = timelineDataOf(r.game);
    expect(data.timelines.h.map(c => c.year)).toEqual([1980]);
    expect(data.timelines.a.map(c => c.year)).toEqual([2000]);
    expect(r.game.scores).toEqual({ h: 1, a: 1 });
    expect(data.round).toMatchObject({ state: "listening", trackId: "p1" });
    expect(r.effects).toEqual([{ type: "play", trackId: "p1" }]);
  });

  it("keeps the current song's title and year out of the public state", () => {
    const json = JSON.stringify(started());
    expect(json).not.toContain("Song p1");
    expect(json).not.toContain("1990");
  });

  it("a correct placement adds the card and a point", () => {
    let g = started(); // h has [1980], song p1 is 1990
    expect(applyAction(g, "a", { type: "place", index: 1 }, ctx()).ok).toBe(false); // not a's turn
    g = act(g, "h", { type: "place", index: 1 }).game;
    const data = timelineDataOf(g);
    expect(data.round?.result).toMatchObject({ correct: true, card: { name: "Song p1", year: 1990 } });
    expect(data.timelines.h.map(c => c.year)).toEqual([1980, 1990]);
    expect(g.scores.h).toBe(2);
  });

  it("a wrong placement discards the card", () => {
    let g = started();
    g = act(g, "h", { type: "place", index: 0 }).game; // 1990 before 1980 → wrong
    expect(timelineDataOf(g).round?.result?.correct).toBe(false);
    expect(timelineDataOf(g).timelines.h).toHaveLength(1);
    expect(g.scores.h).toBe(1);
  });

  it("next passes the turn and plays a new song; redraw swaps the song", () => {
    let g = started();
    g = act(g, "h", { type: "place", index: 1 }).game;
    const next = act(g, "h", { type: "next" });
    expect(next.game.currentPlayerIndex).toBe(1);
    expect(timelineDataOf(next.game).round).toMatchObject({ state: "listening", trackId: "p2" });
    expect(next.effects).toEqual([{ type: "play", trackId: "p2" }]);
    const redraw = act(next.game, "a", { type: "redraw" });
    expect(timelineDataOf(redraw.game).round?.trackId).toBe("p3");
  });

  it("finishes when someone reaches the card goal", () => {
    let g = started(2);
    g = act(g, "h", { type: "place", index: 1 }).game;
    expect(g.status).toBe("playing"); // result is shown first
    g = act(g, "h", { type: "next" }).game;
    expect(g.status).toBe("finished");
  });

  it("shows the active player's aim live and only lets them aim", () => {
    let g = started();
    expect(applyAction(g, "a", { type: "aim", index: 0 }, ctx()).ok).toBe(false);
    g = act(g, "h", { type: "aim", index: 1 }).game;
    expect(timelineDataOf(g).round?.aim).toBe(1);
    expect(applyAction(g, "h", { type: "aim", index: 5 }, ctx()).ok).toBe(false); // beyond the timeline
  });

  it("remembers where a wrong card was placed", () => {
    const g = act(started(), "h", { type: "place", index: 0 }).game;
    expect(timelineDataOf(g).round?.result).toMatchObject({ correct: false, index: 0 });
  });

  it("time limit starts when the song plays and loses the card when it runs out", () => {
    let g = started(10, 30);
    expect(applyAction(g, "a", { type: "timeout" }, ctx({ now: 999_999 })).ok).toBe(false); // not playing yet → no deadline
    g = playing(g, 10_000);
    expect(applyAction(g, "a", { type: "timeout" }, ctx({ now: 20_000 })).ok).toBe(false); // still running
    const out = act(g, "a", { type: "timeout" }, ctx({ now: 40_000 })).game;
    expect(timelineDataOf(out).round?.result).toMatchObject({ correct: false, index: null });
    expect(out.scores.h).toBe(1);
    // A late placement after the deadline counts as timed out too
    const late = act(g, "h", { type: "place", index: 1 }, ctx({ now: 45_000 })).game;
    expect(timelineDataOf(late).round?.result).toMatchObject({ correct: false, index: null });
  });

  it("when the time runs out, the gap the player picked last counts", () => {
    let g = playing(started(10, 30), 10_000);
    expect(timeline.deadline!(timelineDataOf(g))).toBe(40_000);
    g = act(g, "h", { type: "aim", index: 1 }).game; // 1990 after 1980: right
    const out = act(g, "h", { type: "timeout" }, ctx({ now: 40_000 })).game;
    expect(timelineDataOf(out).round?.result).toMatchObject({ correct: true, index: 1 });
    expect(out.scores.h).toBe(2);
    expect(timeline.deadline!(timelineDataOf(out))).toBeNull();
  });

  it("only the next player (or the host) continues", () => {
    let g = newGame("g1", 0);
    for (const [i, id] of ["h", "a", "b"].entries()) g = addPlayer(g, { id, name: id, joinedAt: i })!;
    g = act(g, "h", { type: "setMode", mode: "timeline" }).game;
    g = act(g, "h", { type: "start" }).game;
    g = act(g, "h", { type: "place", index: 0 }).game;
    expect(applyAction(g, "b", { type: "next" }, ctx()).ok).toBe(false);
    expect(applyAction(g, "a", { type: "next" }, ctx()).ok).toBe(true);  // a is next
    expect(applyAction(g, "h", { type: "next" }, ctx()).ok).toBe(true);  // host fallback
  });

  it("validates actions", () => {
    expect(parseAction({ type: "place", index: -1 }, "timeline")).toBeNull();
    expect(parseAction({ type: "place", index: 1.5 }, "timeline")).toBeNull();
    expect(parseAction({ type: "buzz" }, "timeline")).toBeNull();
    expect(parseAction({ type: "place", index: 2 }, "timeline")).toEqual({ type: "place", index: 2 });
    expect(parseAction({ type: "aim", index: null }, "timeline")).toEqual({ type: "aim", index: null });
    expect(parseAction({ type: "timeout" }, "timeline")).toEqual({ type: "timeout" });
  });
});

describe("timeline gemeinsam", () => {
  // Deck: team start card 1980, then p-songs as in the playlist (2000 is the 2nd card drawn → first song to place)
  function coop(lives = 2, targetScore = 10): Game {
    let g = newGame("g1", 0);
    for (const [i, id] of ["h", "a", "b"].entries()) g = addPlayer(g, { id, name: id.toUpperCase(), joinedAt: i })!;
    g = act(g, "h", { type: "setMode", mode: "timeline" }).game;
    g = act(g, "h", { type: "updateSettings", patch: { targetScore } }).game;
    g = act(g, "h", { type: "updateModeSettings", patch: { coop: true, lives } }).game;
    return act(g, "h", { type: "start" }).game;
  }

  it("deals one shared timeline and gives everyone the team score", () => {
    const g = coop();
    const data = timelineDataOf(g);
    expect(Object.keys(data.timelines)).toEqual([TEAM]);
    expect(data.timelines[TEAM].map(c => c.year)).toEqual([1980]);
    expect(data.livesLeft).toBe(2);
    expect(g.scores).toEqual({ h: 1, a: 1, b: 1 });
    expect(data.round).toMatchObject({ trackId: "s2", suggestions: {} });
  });

  it("others suggest gaps, the active player decides; correct cards count for everyone", () => {
    let g = coop();
    expect(applyAction(g, "h", { type: "suggest", index: 1 }, ctx()).ok).toBe(false); // active player places instead
    g = act(g, "a", { type: "suggest", index: 1 }).game;
    g = act(g, "b", { type: "suggest", index: 0 }).game;
    g = act(g, "b", { type: "suggest", index: null }).game;
    expect(timelineDataOf(g).round?.suggestions).toEqual({ a: 1 });
    g = act(g, "h", { type: "place", index: 1 }).game; // 2000 after 1980
    expect(timelineDataOf(g).timelines[TEAM].map(c => c.year)).toEqual([1980, 2000]);
    expect(g.scores).toEqual({ h: 2, a: 2, b: 2 });
    expect(timelineDataOf(g).stats).toEqual({ h: { correct: 1, total: 1 } });
  });

  it("a wrong card costs a life; without lives the game ends as lost", () => {
    let g = coop(1);
    g = act(g, "h", { type: "place", index: 0 }).game; // 2000 before 1980 → wrong
    expect(timelineDataOf(g).livesLeft).toBe(0);
    expect(timeline.teamResult!(timelineDataOf(g))).toMatchObject({ won: false, title: "Keine Leben mehr" });
    g = act(g, "h", { type: "next" }).game;
    expect(g.status).toBe("finished");
  });

  it("reaching the card goal together wins", () => {
    let g = coop(3, 2);
    g = act(g, "h", { type: "place", index: 1 }).game;
    g = act(g, "h", { type: "next" }).game;
    expect(g.status).toBe("finished");
    expect(timeline.teamResult!(timelineDataOf(g))).toMatchObject({ won: true, title: "Geschafft!" });
  });

  it("suggestions only exist in coop games", () => {
    expect(applyAction(started(), "a", { type: "suggest", index: 0 }, ctx()).ok).toBe(false);
    expect(timeline.teamResult!(timelineDataOf(started()))).toBeNull();
  });
});
