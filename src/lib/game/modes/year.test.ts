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

function started(maxRounds = 10, guessTimeLimit = 30): Game {
  let g = newGame("g1", 0);
  for (const [i, id] of ["h", "a", "b"].entries()) g = addPlayer(g, { id, name: id.toUpperCase(), joinedAt: i })!;
  g = act(g, "h", { type: "setMode", mode: "year" }).game;
  g = act(g, "h", { type: "updateSettings", patch: { maxRounds } }).game;
  g = act(g, "h", { type: "updateModeSettings", patch: { guessTimeLimit } }).game;
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

  it("ends guessing when the time is up, not before", () => {
    let g = playing(started(10, 30), 1000);
    g = act(g, "a", { type: "guess", year: 1986 }).game;
    expect(applyAction(g, "h", { type: "timeout" }, ctx({ now: 20_000 })).ok).toBe(false);
    expect(applyAction(g, "b", { type: "guess", year: 1987 }, ctx({ now: 40_000 })).ok).toBe(false);
    g = act(g, "h", { type: "timeout" }, ctx({ now: 31_000 })).game;
    expect(yearData(g).round?.result?.points).toEqual({ a: 2 });
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
    expect(parseAction({ type: "guess", year: 1987.5 }, "year")).toBeNull();
    expect(parseAction({ type: "guess", year: 1200 }, "year")).toBeNull();
  });
});
