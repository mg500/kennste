import { describe, expect, it } from "vitest";
import { addPlayer, applyAction, continuingPlayer, newGame, parseAction, type Context } from "../reducer";
import type { Action, Game, Track } from "../types";
import { JUDGE_MS, versus, versusData } from "./versus";

const track = (id: string): Track => ({ id, name: `Song ${id}`, artist: "Band", releaseYear: "1984", albumArt: null, previewUrl: null });
const playlist = [track("p1"), track("p2"), track("p3")];
const ctx = (extra: Partial<Context> = {}): Context => ({ now: 1000, random: () => 0, playlist, ...extra });

function act(game: Game, actor: string, action: Action, c = ctx()) {
  const r = applyAction(game, actor, action, c);
  if (!r.ok) throw new Error(`${action.type} by ${actor} failed: ${r.error}`);
  return r;
}

/** Host "h" and players "a", "b", "c". */
function started(settings: Record<string, unknown> = {}, maxRounds = 10): Game {
  let g = newGame("g1", 0);
  for (const [i, id] of ["h", "a", "b", "c"].entries()) g = addPlayer(g, { id, name: id.toUpperCase(), joinedAt: i })!;
  g = act(g, "h", { type: "setMode", mode: "versus" }).game;
  g = act(g, "h", { type: "updateSettings", patch: { maxRounds } }).game;
  g = act(g, "h", { type: "updateModeSettings", patch: settings }).game;
  return act(g, "h", { type: "start" }).game;
}
const round = (g: Game) => versusData(g).round!;

describe("Alle gegen alle", () => {
  it("everyone hears the same song and anyone may buzz; the song stays a secret", () => {
    const g = started();
    expect(round(g)).toMatchObject({ state: "playing", trackId: "p1" });
    expect(JSON.stringify(g.mode)).not.toContain("Song p1");
    const buzz = act(g, "h", { type: "buzz" }); // the host plays along, too
    expect(buzz.effects).toEqual([{ type: "pause" }]);
    expect(round(buzz.game)).toMatchObject({ state: "buzzed", buzzedBy: "h" });
    expect(JSON.stringify(buzz.game.mode)).not.toContain("Song p1");
    expect(applyAction(buzz.game, "a", { type: "buzz" }, ctx()).ok).toBe(false); // one at a time
  });

  it("the buzzer answers first and sees the song only afterwards: after the answer time or when they're done", () => {
    let g = started({ answerTime: 10 });
    g = act(g, "a", { type: "buzz" }, ctx({ now: 1000 })).game;
    expect(applyAction(g, "a", { type: "judge", verdict: "correct" }, ctx()).ok).toBe(false); // not before seeing the song
    expect(versus.deadline!(versusData(g))).toBe(11_000);
    expect(applyAction(g, "h", { type: "timeout" }, ctx({ now: 5000 })).ok).toBe(false);
    const timedOut = act(g, "h", { type: "timeout" }, ctx({ now: 11_000 })).game;
    expect(round(timedOut)).toMatchObject({ state: "judging", judgingAt: 11_000 });
    expect(applyAction(g, "b", { type: "answered" }, ctx()).ok).toBe(false); // only the buzzer
    g = act(g, "a", { type: "answered" }, ctx({ now: 4000 })).game;
    expect(round(g).state).toBe("judging");
    expect(JSON.stringify(g.mode)).not.toContain("Song p1"); // still only via the answer route
    // Doesn't judge (phone in the pocket): counts as wrong
    expect(versus.deadline!(versusData(g))).toBe(4000 + JUDGE_MS);
    g = act(g, "h", { type: "timeout" }, ctx({ now: 4000 + JUDGE_MS })).game;
    expect(round(g)).toMatchObject({ state: "playing", buzzedBy: undefined });
  });

  it("without a time to answer, the buzzer takes as long as they need and says when they're done", () => {
    let g = started({ answerTime: 0 });
    g = act(g, "a", { type: "buzz" }, ctx({ now: 1000 })).game;
    expect(versus.deadline!(versusData(g))).toBeNull();
    expect(applyAction(g, "h", { type: "timeout" }, ctx({ now: 600_000 })).ok).toBe(false);
    g = act(g, "a", { type: "answered" }, ctx({ now: 90_000 })).game;
    expect(round(g).state).toBe("judging");
  });

  it("only the buzzer judges; wrong: the song goes on for the others, the buzzer saw the solution and is out for this song", () => {
    let g = started();
    g = act(g, "a", { type: "buzz" }).game;
    g = act(g, "a", { type: "answered" }).game;
    expect(applyAction(g, "b", { type: "judge", verdict: "wrong" }, ctx()).ok).toBe(false);
    const r = act(g, "a", { type: "judge", verdict: "wrong" }, ctx({ now: 3000 }));
    expect(r.effects).toEqual([{ type: "play" }]);
    g = r.game;
    expect(round(g).state).toBe("playing");
    const again = applyAction(g, "a", { type: "buzz" }, ctx({ now: 60_000 }));
    expect(again.ok).toBe(false);
    g = act(g, "b", { type: "buzz" }, ctx({ now: 4000 })).game; // the others still may
    expect(round(g).buzzedBy).toBe("b");
  });

  it("\"Keine Ahnung\" doesn't lock the buzzer: whoever remembers the song after all still buzzes", () => {
    let g = started();
    g = act(g, "a", { type: "skip" }).game;
    expect(round(g).skipped).toEqual(["a"]);
    g = act(g, "a", { type: "buzz" }).game;
    expect(round(g)).toMatchObject({ state: "buzzed", buzzedBy: "a", skipped: [] });
  });

  it("right: everyone sees the song, the music goes on, and the point needs a majority of the others – without a time limit", () => {
    let g = started();
    g = act(g, "a", { type: "buzz" }).game;
    g = act(g, "a", { type: "answered" }).game;
    const claim = act(g, "a", { type: "judge", verdict: "correct" }, ctx({ now: 2000 }));
    expect(claim.effects).toEqual([{ type: "play" }]);
    g = claim.game;
    expect(round(g)).toMatchObject({ state: "vote", song: { name: "Song p1" } });
    expect(versus.deadline!(versusData(g))).toBeNull();
    expect(applyAction(g, "a", { type: "vote", confirm: true }, ctx()).ok).toBe(false); // not for oneself
    g = act(g, "b", { type: "vote", confirm: true }).game; // 1 of 3 – 2 needed
    g = act(g, "c", { type: "vote", confirm: false }).game;
    g = act(g, "c", { type: "vote", confirm: null }).game; // changed their mind
    expect(round(g).state).toBe("vote");
    g = act(g, "h", { type: "vote", confirm: true }).game;
    expect(round(g)).toMatchObject({ state: "revealed", result: { winner: "a" }, votes: { b: true, h: true } });
    expect(g.scores.a).toBe(1);
  });

  it("no point once a majority can't be reached anymore, then on to the next song", () => {
    let g = started();
    g = act(g, "a", { type: "buzz" }).game;
    g = act(g, "a", { type: "answered" }).game;
    g = act(g, "a", { type: "judge", verdict: "correct" }).game;
    g = act(g, "b", { type: "vote", confirm: false }).game;
    expect(round(g).state).toBe("vote"); // h and c could still confirm
    g = act(g, "c", { type: "vote", confirm: false }).game;
    expect(round(g)).toMatchObject({ state: "revealed", result: { rejected: true } });
    expect(g.scores.a).toBe(0);
    expect(continuingPlayer(g)?.id).toBe("h");
    g = act(g, "h", { type: "next" }).game;
    expect(round(g)).toMatchObject({ state: "playing", trackId: "p2" });
  });

  it("the host settles a vote that doesn't come to an end", () => {
    let g = started();
    g = act(g, "a", { type: "buzz" }).game;
    g = act(g, "a", { type: "answered" }).game;
    g = act(g, "a", { type: "judge", verdict: "correct" }).game;
    expect(applyAction(g, "b", { type: "decide", confirm: true }, ctx()).ok).toBe(false);
    expect(round(act(g, "h", { type: "decide", confirm: false }).game).result).toEqual({ rejected: true });
    const confirmed = act(g, "h", { type: "decide", confirm: true }).game;
    expect(round(confirmed).result).toEqual({ winner: "a" });
    expect(confirmed.scores.a).toBe(1);
  });

  it("the song is revealed when nobody can buzz anymore or the time is up", async () => {
    let g = started({ playTimeLimit: 30 });
    g = act(g, "a", { type: "buzz" }).game;
    g = act(g, "a", { type: "answered" }).game;
    g = act(g, "a", { type: "judge", verdict: "wrong" }).game;
    for (const id of ["h", "b"]) g = act(g, id, { type: "skip" }).game;
    expect(round(g).state).toBe("playing"); // c may still buzz, and so may h and b
    g = act(g, "c", { type: "skip" }).game;
    expect(round(g)).toMatchObject({ state: "revealed", song: { name: "Song p1" }, result: {} });

    // The play time limit
    let t = started({ playTimeLimit: 30 });
    const data = structuredClone(versusData(t));
    versus.onPlaying!(data, "p1", 1000);
    t = { ...t, mode: data };
    expect(versus.deadline!(versusData(t))).toBe(31_000);
    t = act(t, "h", { type: "timeout" }, ctx({ now: 31_000 })).game;
    expect(round(t).state).toBe("revealed");
  });

  it("validates actions", () => {
    expect(parseAction({ type: "vote", confirm: null }, "versus")).toEqual({ type: "vote", confirm: null });
    expect(parseAction({ type: "vote" }, "versus")).toBeNull();
    expect(parseAction({ type: "decide", confirm: "yes" }, "versus")).toBeNull();
    expect(parseAction({ type: "judge", verdict: "maybe" }, "versus")).toBeNull();
  });
});

describe("Alle gegen alle: history", () => {
  it("records buzzes, own \"wrong\"s, \"Stimmt nicht\" votes and how fast the winner was", () => {
    let g = started();
    const data = structuredClone(versusData(g));
    versus.onPlaying!(data, "p1", 1000);
    g = { ...g, mode: data };
    g = act(g, "a", { type: "buzz" }, ctx({ now: 2000 })).game;
    g = act(g, "a", { type: "answered" }, ctx({ now: 2500 })).game;
    g = act(g, "a", { type: "judge", verdict: "wrong" }, ctx({ now: 3000 })).game;
    g = act(g, "b", { type: "buzz" }, ctx({ now: 4000 })).game;
    g = act(g, "b", { type: "answered" }, ctx({ now: 4500 })).game;
    g = act(g, "b", { type: "judge", verdict: "correct" }, ctx({ now: 5000 })).game;
    g = act(g, "c", { type: "vote", confirm: false }).game;
    g = act(g, "h", { type: "vote", confirm: true }).game;
    g = act(g, "a", { type: "vote", confirm: true }).game;
    expect(g.history?.[0]).toMatchObject({
      points: { b: 1 },
      stats: { a: { buzzes: 1, selfWrong: 1 }, b: { buzzes: 1, rightMs: 3000 }, c: { votedNo: 1 }, h: {} },
    });
  });
});
