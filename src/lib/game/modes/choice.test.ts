import { describe, expect, it } from "vitest";
import { addPlayer, applyAction, newGame, parseAction, type Context } from "../reducer";
import type { Action, Game, Track } from "../types";
import { choice, choiceData } from "./choice";

const track = (id: string, name: string, artist: string): Track => ({ id, name, artist, releaseYear: "1987", albumArt: null, previewUrl: null });
const playlist = [
  track("p1", "Never Gonna Give You Up", "Rick Astley"),
  track("p2", "Take On Me", "a-ha"),
  track("p3", "Africa", "Toto"),
  track("p4", "Hold the Line", "Toto"),
  track("p5", "Don't You", "Simple Minds"),
];
const ctx = (extra: Partial<Context> = {}): Context => ({ now: 1000, random: () => 0, playlist, ...extra });

function act(game: Game, actor: string, action: Action, c = ctx()) {
  const r = applyAction(game, actor, action, c);
  if (!r.ok) throw new Error(`${action.type} by ${actor} failed: ${r.error}`);
  return r;
}

function started(settings: Record<string, unknown> = {}, maxRounds = 10): Game {
  let g = newGame("g1", 0);
  for (const [i, id] of ["h", "a", "b"].entries()) g = addPlayer(g, { id, name: id.toUpperCase(), joinedAt: i })!;
  g = act(g, "h", { type: "setMode", mode: "choice" }).game;
  g = act(g, "h", { type: "updateSettings", patch: { maxRounds } }).game;
  g = act(g, "h", { type: "updateModeSettings", patch: settings }).game;
  return act(g, "h", { type: "start" }).game;
}

const correctIndex = (g: Game) => choiceData(g).round!.options.indexOf("Never Gonna Give You Up");

describe("Song-Tipp", () => {
  it("offers four distinct options including the right one, without saying which", () => {
    const g = started();
    const round = choiceData(g).round!;
    expect(round).toMatchObject({ state: "answering", trackId: "p1", field: "title" });
    expect(round.options).toHaveLength(4);
    expect(new Set(round.options).size).toBe(4);
    expect(round.options).toContain("Never Gonna Give You Up");
    expect(round.result).toBeUndefined();
  });

  it("asks for distinct artists in artist rounds", () => {
    const round = choiceData(started({ ask: "artist" })).round!;
    expect(round.field).toBe("artist");
    expect(round.options).toContain("Rick Astley");
    expect(round.options.filter(o => o === "Toto")).toHaveLength(1);
  });

  it("alternates title and artist in mixed mode", () => {
    let g = started({ ask: "mixed" });
    expect(choiceData(g).round?.field).toBe("title");
    g = act(g, "h", { type: "reveal" }).game;
    g = act(g, "h", { type: "next" }).game;
    expect(choiceData(g).round?.field).toBe("artist");
  });

  it("answers are final; reveal once all answered; fastest correct gets a bonus", () => {
    let g = started();
    const right = correctIndex(g);
    const wrong = (right + 1) % 4;
    g = act(g, "a", { type: "answer", option: right }, ctx({ now: 3000 })).game;
    expect(applyAction(g, "a", { type: "answer", option: wrong }, ctx()).ok).toBe(false);
    g = act(g, "b", { type: "answer", option: wrong }, ctx({ now: 2000 })).game;
    g = act(g, "h", { type: "answer", option: right }, ctx({ now: 5000 })).game;
    const result = choiceData(g).round!.result!;
    expect(result.correct).toBe(right);
    expect(result.fastest).toBe("a");
    expect(result.points).toEqual({ a: 3, h: 2 });
    expect(g.scores).toEqual({ h: 2, a: 3, b: 0 });
  });

  it("ends answering when the time is up and the host continues", () => {
    let g = started({ answerTimeLimit: 20 }, 1);
    const data = structuredClone(choiceData(g));
    choice.onPlaying!(data, "p1", 1000);
    g = { ...g, mode: data };
    expect(applyAction(g, "h", { type: "timeout" }, ctx({ now: 10_000 })).ok).toBe(false);
    expect(applyAction(g, "a", { type: "answer", option: 0 }, ctx({ now: 30_000 })).ok).toBe(false);
    g = act(g, "h", { type: "timeout" }, ctx({ now: 21_000 })).game;
    expect(choiceData(g).round?.state).toBe("revealed");
    expect(applyAction(g, "a", { type: "next" }, ctx()).ok).toBe(false);
    expect(act(g, "h", { type: "next" }).game.status).toBe("finished");
  });

  it("validates answers", () => {
    expect(parseAction({ type: "answer", option: 2 }, "choice")).toEqual({ type: "answer", option: 2 });
    expect(parseAction({ type: "answer", option: 4 }, "choice")).toBeNull();
    expect(parseAction({ type: "answer", option: "1" }, "choice")).toBeNull();
  });
});

describe("Song-Tipp: history", () => {
  it("records who was right, how fast and who got the bonus", () => {
    let g = started();
    const data = structuredClone(choiceData(g));
    choice.onPlaying!(data, data.round!.trackId, 1000);
    g = { ...g, mode: data };
    const right = choiceData(g).round!.options.indexOf("Never Gonna Give You Up");
    g = act(g, "a", { type: "answer", option: right }, ctx({ now: 3500 })).game;
    g = act(g, "h", { type: "answer", option: right }, ctx({ now: 5000 })).game;
    g = act(g, "b", { type: "answer", option: (right + 1) % 4 }, ctx({ now: 6000 })).game;
    expect(g.history?.[0].stats).toEqual({ a: { rightMs: 2500, fastest: true }, h: { rightMs: 4000 }, b: {} });
    expect(g.history?.[0].points).toEqual({ a: 3, h: 2 });
  });
});
