import { describe, expect, it } from "vitest";
import { addPlayer, applyAction, continuingPlayer, newGame, parseAction, type Context } from "../reducer";
import type { Action, Game, Track } from "../types";
import { together, togetherData } from "./together";

const track = (id: string, y: number): Track => ({ id, name: `Song ${id}`, artist: `Artist ${id}`, releaseYear: String(y), albumArt: null, previewUrl: null });
// Two start cards (1970, 2000), then the songs to place
const playlist = [track("s1", 1970), track("s2", 2000), track("p1", 1985), track("p2", 2010), track("p3", 1960)];
const ctx = (extra: Partial<Context> = {}): Context => ({ now: 1000, random: () => 0, playlist, ...extra });

function act(game: Game, actor: string, action: Action, c = ctx()) {
  const r = applyAction(game, actor, action, c);
  if (!r.ok) throw new Error(`${action.type} by ${actor} failed: ${r.error}`);
  return r;
}

function started(maxRounds = 10, placeTimeLimit = 30): Game {
  let g = newGame("g1", 0);
  for (const [i, id] of ["h", "a", "b"].entries()) g = addPlayer(g, { id, name: id.toUpperCase(), joinedAt: i })!;
  g = act(g, "h", { type: "setMode", mode: "together" }).game;
  g = act(g, "h", { type: "updateSettings", patch: { maxRounds } }).game;
  g = act(g, "h", { type: "updateModeSettings", patch: { placeTimeLimit } }).game;
  return act(g, "h", { type: "start" }).game;
}

function playing(g: Game, now: number): Game {
  const data = structuredClone(togetherData(g));
  together.onPlaying!(data, data.round!.trackId, now);
  return { ...g, mode: data };
}

describe("Zeitstrahl für alle", () => {
  it("starts with the face-up cards in one shared timeline, the next song hidden", () => {
    const g = started();
    const data = togetherData(g);
    expect(data.timeline.map(c => c.year)).toEqual([1970, 2000]);
    expect(data.round).toMatchObject({ state: "placing", trackId: "p1", picks: {}, done: [] });
    expect(JSON.stringify(data.round)).not.toContain("1985");
  });

  it("reveals once everyone is done: a point for every right gap, the card joins the timeline", () => {
    let g = started();
    g = act(g, "h", { type: "pick", index: 1, done: true }).game; // between 1970 and 2000: right
    g = act(g, "a", { type: "pick", index: 0 }).game;
    g = act(g, "a", { type: "pick", index: 1, done: true }).game; // changed her mind: right
    expect(togetherData(g).round?.state).toBe("placing");
    g = act(g, "b", { type: "pick", index: 2, done: true }).game; // after 2000: wrong
    const data = togetherData(g);
    expect(data.round?.state).toBe("revealed");
    expect(data.round?.result).toMatchObject({ index: 1, points: { h: 1, a: 1 } });
    expect(data.timeline.map(c => c.year)).toEqual([1970, 1985, 2000]);
    expect(g.scores).toEqual({ h: 1, a: 1, b: 0 });
  });

  it("when the time is up, the gap each player picked last counts – done or not", () => {
    let g = playing(started(10, 30), 1000);
    expect(together.deadline!(togetherData(g))).toBe(31_000);
    g = act(g, "a", { type: "pick", index: 1 }).game;
    g = act(g, "b", { type: "pick", index: 0 }).game;
    expect(applyAction(g, "h", { type: "timeout" }, ctx({ now: 20_000 })).ok).toBe(false);
    expect(applyAction(g, "h", { type: "pick", index: 1 }, ctx({ now: 40_000 })).ok).toBe(false);
    g = act(g, "h", { type: "timeout" }, ctx({ now: 31_000 })).game;
    expect(togetherData(g).round?.result?.points).toEqual({ a: 1 });
    expect(together.deadline!(togetherData(g))).toBeNull();
  });

  it("the host continues; every song is one round, the timeline keeps growing", () => {
    let g = started(2);
    for (const id of ["h", "a", "b"]) g = act(g, id, { type: "pick", index: 1, done: true }).game;
    expect(continuingPlayer(g)?.id).toBe("h");
    expect(applyAction(g, "a", { type: "next" }, ctx()).ok).toBe(false);
    g = act(g, "h", { type: "next" }).game;
    expect(g.currentRound).toBe(2);
    expect(togetherData(g).round?.trackId).toBe("p2");
    g = act(g, "h", { type: "reveal" }).game;
    expect(togetherData(g).timeline.map(c => c.year)).toEqual([1970, 1985, 2000, 2010]);
    g = act(g, "h", { type: "next" }).game;
    expect(g.status).toBe("finished");
  });

  it("only players pick, only gaps that exist", () => {
    let g = newGame("g1", 0);
    for (const [i, id] of ["h", "a", "v"].entries()) g = addPlayer(g, { id, name: id, joinedAt: i })!;
    g = act(g, "h", { type: "setMode", mode: "together" }).game;
    g = act(g, "h", { type: "toggleViewer", playerId: "v" }).game;
    g = act(g, "h", { type: "start" }).game;
    expect(applyAction(g, "v", { type: "pick", index: 0 }, ctx()).ok).toBe(false);
    expect(applyAction(g, "a", { type: "pick", index: 3 }, ctx()).ok).toBe(false);
    expect(applyAction(g, "a", { type: "reveal" }, ctx()).ok).toBe(false);
    expect(parseAction({ type: "pick", index: 1, done: true }, "together")).toEqual({ type: "pick", index: 1, done: true });
    expect(parseAction({ type: "pick", index: -1 }, "together")).toBeNull();
  });
});
