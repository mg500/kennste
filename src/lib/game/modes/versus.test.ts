import { describe, expect, it } from "vitest";
import { addPlayer, applyAction, continuingPlayer, newGame, parseAction, type Context } from "../reducer";
import type { Action, Game, Track } from "../types";
import { CONTEST_MS, versus, versusData } from "./versus";

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

  it("only the buzzer judges; wrong: the song goes on, they are locked for a moment and have fewer buzzes", () => {
    let g = started({ cooldown: 5, buzzesPerSong: 2 });
    g = act(g, "a", { type: "buzz" }).game;
    expect(applyAction(g, "b", { type: "judge", verdict: "wrong" }, ctx()).ok).toBe(false);
    const r = act(g, "a", { type: "judge", verdict: "wrong" }, ctx({ now: 3000 }));
    expect(r.effects).toEqual([{ type: "play" }]);
    g = r.game;
    expect(round(g).state).toBe("playing");
    expect(applyAction(g, "a", { type: "buzz" }, ctx({ now: 5000 })).ok).toBe(false); // locked until 8000
    g = act(g, "a", { type: "buzz" }, ctx({ now: 8000 })).game;
    g = act(g, "a", { type: "judge", verdict: "wrong" }, ctx({ now: 9000 })).game;
    expect(applyAction(g, "a", { type: "buzz" }, ctx({ now: 20_000 })).ok).toBe(false); // no buzzes left
  });

  it("right: everyone sees the song; without a majority objecting the point goes to the buzzer after the contest", () => {
    let g = started();
    g = act(g, "a", { type: "buzz" }).game;
    g = act(g, "a", { type: "judge", verdict: "correct" }, ctx({ now: 2000 })).game;
    expect(round(g)).toMatchObject({ state: "contest", song: { name: "Song p1" } });
    expect(versus.deadline!(versusData(g))).toBe(2000 + CONTEST_MS);
    expect(applyAction(g, "a", { type: "object", want: true }, ctx()).ok).toBe(false); // not against oneself
    g = act(g, "b", { type: "object", want: true }).game; // 1 of 3 – 2 needed
    expect(applyAction(g, "h", { type: "timeout" }, ctx({ now: 3000 })).ok).toBe(false);
    g = act(g, "h", { type: "timeout" }, ctx({ now: 7000 })).game;
    expect(round(g)).toMatchObject({ state: "revealed", result: { winner: "a" } });
    expect(g.scores.a).toBe(1);
  });

  it("the majority of the others overrules a wrong \"right\": no point, on to the next song", () => {
    let g = started();
    g = act(g, "a", { type: "buzz" }).game;
    g = act(g, "a", { type: "judge", verdict: "correct" }).game;
    g = act(g, "b", { type: "object", want: true }).game;
    g = act(g, "c", { type: "object", want: true }).game;
    expect(round(g)).toMatchObject({ state: "revealed", result: { overruled: true } });
    expect(g.scores.a).toBe(0);
    expect(continuingPlayer(g)?.id).toBe("h");
    g = act(g, "h", { type: "next" }).game;
    expect(round(g)).toMatchObject({ state: "playing", trackId: "p2" });
  });

  it("no answer in time counts as wrong; the song is revealed when nobody can buzz anymore or the time is up", async () => {
    let g = started({ answerTime: 10, buzzesPerSong: 1, playTimeLimit: 30 });
    g = act(g, "a", { type: "buzz" }, ctx({ now: 1000 })).game;
    g = act(g, "h", { type: "timeout" }, ctx({ now: 11_000 })).game;
    expect(round(g).state).toBe("playing");
    for (const id of ["h", "b"]) g = act(g, id, { type: "skip" }).game;
    expect(round(g).state).toBe("playing"); // c may still buzz
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
    expect(parseAction({ type: "object", want: true }, "versus")).toEqual({ type: "object", want: true });
    expect(parseAction({ type: "object" }, "versus")).toBeNull();
    expect(parseAction({ type: "judge", verdict: "maybe" }, "versus")).toBeNull();
  });
});
