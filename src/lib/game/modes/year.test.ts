import { describe, expect, it } from "vitest";
import { addPlayer, applyAction, continuingPlayer, newGame, parseAction, type Context } from "../reducer";
import type { Action, Game, Track } from "../types";
import { pointsFor, year, yearData } from "./year";

const track = (id: string, y: number | null): Track => ({ id, name: `Song ${id}`, artist: `Artist ${id}`, releaseYear: y === null ? undefined : String(y), albumArt: null, previewUrl: null });
const playlist = [track("p1", 1987), track("nope", null), track("p2", 2003), track("p3", 1975)];
const ctx = (extra: Partial<Context> = {}): Context => ({ now: 1000, random: () => 0, playlist, ...extra });

function act(game: Game, actor: string, action: Action, c = ctx()) {
  const r = applyAction(game, actor, action, c);
  if (!r.ok) throw new Error(`${action.type} by ${actor} failed: ${r.error}`);
  return r;
}

function started(maxRounds = 10, guessTimeLimit = 30, settings: Record<string, unknown> = {}): Game {
  let g = newGame("g1", 0);
  for (const [i, id] of ["h", "a", "b"].entries()) g = addPlayer(g, { id, name: id.toUpperCase(), joinedAt: i })!;
  g = act(g, "h", { type: "setMode", mode: "year" }).game;
  g = act(g, "h", { type: "updateSettings", patch: { maxRounds } }).game;
  g = act(g, "h", { type: "updateModeSettings", patch: { guessTimeLimit, ...settings } }).game;
  return act(g, "h", { type: "start" }).game;
}

function playing(g: Game, now: number): Game {
  const data = structuredClone(yearData(g));
  year.onPlaying!(data, data.round!.trackId, now);
  return { ...g, mode: data };
}

describe("Jahr schätzen", () => {
  it("scores by distance", () => {
    expect([0, 1, 2, 3, 5, 6].map(pointsFor)).toEqual([3, 2, 2, 1, 1, 0]);
  });

  it("reveals once everyone guessed and awards points", () => {
    let g = started();
    expect(yearData(g).round).toMatchObject({ state: "guessing", trackId: "p1", guesses: {} });
    expect(JSON.stringify(g)).not.toContain("1987");
    g = act(g, "h", { type: "guess", year: 1987 }).game;
    g = act(g, "a", { type: "guess", year: 1990 }).game;
    g = act(g, "a", { type: "guess", year: 1985 }).game; // may change the guess
    expect(yearData(g).round?.state).toBe("guessing");
    g = act(g, "b", { type: "guess", year: 2000 }).game;
    const round = yearData(g).round!;
    expect(round.state).toBe("revealed");
    expect(round.result?.song.year).toBe(1987);
    expect(round.result?.points).toEqual({ h: 3, a: 2, b: 0 });
    expect(g.scores).toEqual({ h: 3, a: 2, b: 0 });
  });

  it("with the speed bonus, the fastest of the best guesses gets a point more – timed from when they set the year", () => {
    expect(yearData(started()).settings.speedBonus).toBe(false); // off unless the host turns it on
    let g = playing(started(10, 30, { speedBonus: true }), 1000);
    g = act(g, "a", { type: "guess", year: 1986, draft: true }, ctx({ now: 3000 })).game; // 1 off, set at 3 s
    g = act(g, "b", { type: "guess", year: 1988, draft: true }, ctx({ now: 4000 })).game; // 1 off, set at 4 s
    g = act(g, "h", { type: "guess", year: 1987 }, ctx({ now: 9000 })).game; // exact, but the only one: the bonus goes to the best
    // "Fertig" on the same year doesn't restart the clock – a new year does
    g = act(g, "a", { type: "guess", year: 1986 }, ctx({ now: 8000 })).game;
    g = act(g, "b", { type: "guess", year: 1988 }, ctx({ now: 9500 })).game;
    expect(yearData(g).round?.result).toMatchObject({ fastest: "h", points: { h: 4, a: 2, b: 2 } });

    let tie = started(10, 30, { speedBonus: true });
    tie = playing(tie, 1000);
    tie = act(tie, "b", { type: "guess", year: 1986, draft: true }, ctx({ now: 2000 })).game;
    tie = act(tie, "a", { type: "guess", year: 1986, draft: true }, ctx({ now: 3000 })).game;
    tie = act(tie, "b", { type: "guess", year: 1988, draft: true }, ctx({ now: 5000 })).game; // changed: now later than a
    tie = act(tie, "h", { type: "guess", year: 2010 }, ctx({ now: 6000 })).game;
    tie = act(tie, "a", { type: "guess", year: 1986 }, ctx({ now: 7000 })).game;
    tie = act(tie, "b", { type: "guess", year: 1988 }, ctx({ now: 7000 })).game;
    expect(yearData(tie).round?.result).toMatchObject({ fastest: "a", points: { a: 3, b: 2, h: 0 } });
    expect(tie.scores).toEqual({ h: 0, a: 3, b: 2 });
  });

  it("nobody gets the speed bonus without points", () => {
    let g = playing(started(10, 30, { speedBonus: true }), 1000);
    for (const id of ["h", "a", "b"]) g = act(g, id, { type: "guess", year: 1950 }).game;
    expect(yearData(g).round?.result?.fastest).toBeUndefined();
    expect(g.scores).toEqual({ h: 0, a: 0, b: 0 });
  });

  it("the host continues; every song is one round and none repeats", () => {
    let g = started(2);
    for (const id of ["h", "a", "b"]) g = act(g, id, { type: "guess", year: 1980 }).game;
    expect(continuingPlayer(g)?.id).toBe("h");
    expect(applyAction(g, "a", { type: "next" }, ctx()).ok).toBe(false);
    g = act(g, "h", { type: "next" }).game;
    expect(g.currentRound).toBe(2);
    expect(yearData(g).round?.trackId).toBe("p2"); // the song without a year is skipped
    g = act(g, "h", { type: "reveal" }).game;
    g = act(g, "h", { type: "next" }).game;
    expect(g.status).toBe("finished");
  });

  it("starts somewhere in the middle with random start", () => {
    let g = newGame("g1", 0);
    g = addPlayer(g, { id: "h", name: "H", joinedAt: 0 })!;
    g = act(g, "h", { type: "setMode", mode: "year" }).game;
    g = act(g, "h", { type: "updateModeSettings", patch: { randomStart: true } }).game;
    const long = [{ ...track("p1", 1987), durationMs: 200_000 }];
    expect(act(g, "h", { type: "start" }, ctx({ playlist: long, random: () => 0.5 })).effects)
      .toEqual([{ type: "play", trackId: "p1", positionMs: 85_000 }]);
  });

  it("ends guessing when the time is up, not before", () => {
    let g = playing(started(10, 30), 1000);
    g = act(g, "a", { type: "guess", year: 1986 }).game;
    expect(applyAction(g, "h", { type: "timeout" }, ctx({ now: 20_000 })).ok).toBe(false);
    expect(applyAction(g, "b", { type: "guess", year: 1987 }, ctx({ now: 40_000 })).ok).toBe(false);
    g = act(g, "h", { type: "timeout" }, ctx({ now: 31_000 })).game;
    expect(yearData(g).round?.result?.points).toEqual({ a: 2 });
  });

  it("counts the year someone picked when the time is up, even without pressing \"Fertig\"", () => {
    let g = playing(started(10, 30), 1000);
    expect(year.deadline!(yearData(g))).toBe(31_000);
    g = act(g, "a", { type: "guess", year: 1980, draft: true }).game;
    g = act(g, "a", { type: "guess", year: 1986, draft: true }).game;
    g = act(g, "b", { type: "guess", year: 1987, draft: true }).game;
    g = act(g, "h", { type: "guess", year: 1950 }).game;
    expect(yearData(g).round?.state).toBe("guessing"); // drafts are not "done"
    g = act(g, "h", { type: "timeout" }, ctx({ now: 31_000 })).game;
    expect(yearData(g).round?.result?.points).toEqual({ h: 0, a: 2, b: 3 });
    expect(year.deadline!(yearData(g))).toBeNull();
  });

  it("reveals once everyone pressed \"Fertig\"; changing it again means not done anymore", () => {
    let g = started();
    g = act(g, "h", { type: "guess", year: 1987 }).game;
    g = act(g, "a", { type: "guess", year: 1987 }).game;
    g = act(g, "a", { type: "guess", year: 1990, draft: true }).game;
    g = act(g, "b", { type: "guess", year: 1987 }).game;
    expect(yearData(g).round?.state).toBe("guessing");
    g = act(g, "a", { type: "guess", year: 1990 }).game;
    expect(yearData(g).round?.result?.points).toEqual({ h: 3, a: 1, b: 3 });
  });

  it("only players guess and only the host reveals early", () => {
    let g = newGame("g1", 0);
    for (const [i, id] of ["h", "a", "v"].entries()) g = addPlayer(g, { id, name: id, joinedAt: i })!;
    g = act(g, "h", { type: "setMode", mode: "year" }).game;
    g = act(g, "h", { type: "toggleViewer", playerId: "v" }).game;
    g = act(g, "h", { type: "start" }).game;
    expect(applyAction(g, "v", { type: "guess", year: 1990 }, ctx()).ok).toBe(false);
    expect(applyAction(g, "a", { type: "reveal" }, ctx()).ok).toBe(false);
    expect(applyAction(g, "a", { type: "play" }, ctx()).ok).toBe(false); // nobody is "active"
    expect(act(g, "h", { type: "reveal" }).game.mode).toMatchObject({ round: { state: "revealed" } });
  });

  it("validates guesses", () => {
    expect(parseAction({ type: "guess", year: 1987 }, "year")).toEqual({ type: "guess", year: 1987 });
    expect(parseAction({ type: "guess", year: 1987, draft: true }, "year")).toEqual({ type: "guess", year: 1987, draft: true });
    expect(parseAction({ type: "guess", year: 1987, draft: "yes" }, "year")).toEqual({ type: "guess", year: 1987 });
    expect(parseAction({ type: "guess", year: 1987.5 }, "year")).toBeNull();
    expect(parseAction({ type: "guess", year: 1200 }, "year")).toBeNull();
  });
});

describe("Jahr schätzen: history", () => {
  it("records the song, the points and how far off everyone was; a reset clears it", () => {
    let g = started();
    expect(g.history).toEqual([]);
    for (const [id, y] of [["h", 1987], ["a", 1990]] as const) g = act(g, id, { type: "guess", year: y }).game;
    g = act(g, "h", { type: "reveal" }).game;
    expect(g.history).toEqual([{
      round: 1, song: expect.objectContaining({ trackId: "p1", name: "Song p1" }), points: { h: 3, a: 1 },
      stats: { h: { yearsOff: 0 }, a: { yearsOff: 3 }, b: {} },
    }]);
    expect(act(g, "h", { type: "reset" }).game.history).toBeUndefined();
  });
});
