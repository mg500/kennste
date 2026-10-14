import { describe, expect, it } from "vitest";
import { addPlayer, applyAction, newGame, parseAction, type Context } from "./reducer";
import { buzzerData, type BuzzerSettings } from "./modes/buzzer";
import type { Action, Game, Track } from "./types";

const track = (id: string): Track => ({ id, name: `Song ${id}`, artist: "Artist", albumArt: null, previewUrl: null, releaseYear: "1999" });
const ctx = (extra: Partial<Context> = {}): Context => ({ now: 1000, random: () => 0, ...extra });

/** Lobby with host "h" and players "a", "b" (joined in that order). */
function lobby(): Game {
  let game = newGame("g1", 0);
  for (const [i, id] of ["h", "a", "b"].entries()) game = addPlayer(game, { id, name: id.toUpperCase(), joinedAt: i })!;
  return game;
}

function act(game: Game, actor: string, action: Action, c = ctx()) {
  const r = applyAction(game, actor, action, c);
  if (!r.ok) throw new Error(`${action.type} by ${actor} failed: ${r.error}`);
  return r;
}

function started(settings: Partial<Game["settings"]> = {}, modeSettings: Partial<BuzzerSettings> = {}): Game {
  let g = act(lobby(), "h", { type: "updateSettings", patch: settings }).game;
  g = act(g, "h", { type: "updateModeSettings", patch: modeSettings }).game;
  return act(g, "h", { type: "start" }).game;
}

describe("lobby", () => {
  it("first player becomes host", () => {
    expect(lobby().hostPlayerId).toBe("h");
  });

  it("does not mutate the input game", () => {
    const g = lobby();
    const snapshot = structuredClone(g);
    act(g, "h", { type: "kick", playerId: "a" });
    expect(g).toEqual(snapshot);
  });

  it("only the host may change settings, kick or start", () => {
    const g = lobby();
    for (const action of [
      { type: "updateSettings", patch: { maxRounds: 3 } },
      { type: "updateModeSettings", patch: { maxBuzzesPerRound: 2 } },
      { type: "setMode", mode: "buzzer" },
      { type: "kick", playerId: "b" },
      { type: "toggleViewer", playerId: "b" },
      { type: "start" },
    ] as Action[]) {
      const r = applyAction(g, "a", action, ctx());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(403);
    }
  });

  it("validates settings ranges", () => {
    let g = act(lobby(), "h", { type: "updateSettings", patch: { maxRounds: 99, targetScore: 4 } }).game;
    g = act(g, "h", { type: "updateModeSettings", patch: { buzzTimeLimit: -1, maxBuzzesPerRound: 2 } }).game;
    expect(g.settings.maxRounds).toBe(5);
    expect(g.settings.targetScore).toBe(4);
    expect(buzzerData(g).settings.buzzTimeLimit).toBe(10);
    expect(buzzerData(g).settings.maxBuzzesPerRound).toBe(2);
  });

  it("only allows autoPause to change during a game", () => {
    const g = act(started(), "h", { type: "updateModeSettings", patch: { autoPauseOnBuzz: false, maxBuzzesPerRound: 3 } }).game;
    expect(buzzerData(g).settings.autoPauseOnBuzz).toBe(false);
    expect(buzzerData(g).settings.maxBuzzesPerRound).toBe(1);
    expect(applyAction(g, "h", { type: "updateSettings", patch: { maxRounds: 2 } }, ctx()).ok).toBe(false);
  });

  it("rejects mode actions outside of a running game", () => {
    expect(applyAction(lobby(), "a", { type: "buzz" }, ctx()).ok).toBe(false);
  });

  it("refuses to start playlist mode without tracks", () => {
    const g = act(lobby(), "h", { type: "updateSettings", patch: { songSource: "playlist" } }).game;
    expect(applyAction(g, "h", { type: "start" }, ctx()).ok).toBe(false);
  });

  it("host cannot be kicked or made a viewer", () => {
    expect(applyAction(lobby(), "h", { type: "kick", playerId: "h" }, ctx()).ok).toBe(false);
    expect(applyAction(lobby(), "h", { type: "toggleViewer", playerId: "h" }, ctx()).ok).toBe(false);
  });
});

describe("viewers", () => {
  it("are moved out of the rotation and cannot buzz", () => {
    let g = act(lobby(), "h", { type: "toggleViewer", playerId: "b" }).game;
    g = act(g, "h", { type: "start" }).game;
    expect(g.players.map(p => p.id)).toEqual(["h", "a"]);
    expect(g.viewerPlayers?.map(p => p.id)).toEqual(["b"]);
    g = act(g, "h", { type: "pickSong", track: track("t1") }).game;
    expect(applyAction(g, "b", { type: "buzz" }, ctx()).ok).toBe(false);
  });

  it("are merged back on reset", () => {
    let g = act(lobby(), "h", { type: "toggleViewer", playerId: "a" }).game;
    g = act(g, "h", { type: "start" }).game;
    g = act(g, "h", { type: "reset" }).game;
    expect(g.players.map(p => p.id)).toEqual(["h", "a", "b"]);
    expect(g.status).toBe("lobby");
  });

  it("host can abort a running game: everyone stays, scores reset, music stops", () => {
    let g = act(started(), "h", { type: "pickSong", track: track("t1") }).game;
    g = act(g, "a", { type: "buzz" }).game;
    g = act(g, "h", { type: "judge", verdict: "correct" }).game;
    expect(applyAction(g, "a", { type: "reset" }, ctx()).ok).toBe(false); // host only
    const r = act(g, "h", { type: "reset" });
    expect(r.game.status).toBe("lobby");
    expect(r.game.players.map(p => p.id)).toEqual(["h", "a", "b"]);
    expect(r.game.scores).toEqual({ h: 0, a: 0, b: 0 });
    expect(buzzerData(r.game).round).toBeUndefined();
    expect(r.effects).toEqual([{ type: "pause" }]);
    expect(act(r.game, "h", { type: "start" }).game.status).toBe("playing"); // and start again
  });
});

describe("round flow", () => {
  it("picker picks, guesser buzzes, picker judges correct", () => {
    let g = started();
    const pick = act(g, "h", { type: "pickSong", track: track("t1") });
    expect(pick.effects).toEqual([{ type: "play", trackId: "t1" }]);
    g = pick.game;
    expect(buzzerData(g).round?.state).toBe("playing");

    const buzz = act(g, "a", { type: "buzz" });
    expect(buzz.effects).toEqual([{ type: "pause" }]);
    g = buzz.game;
    expect(buzzerData(g).round?.buzzedBy).toBe("a");

    g = act(g, "h", { type: "judge", verdict: "correct" }).game;
    expect(g.scores.a).toBe(1);
    expect(buzzerData(g).guessedSongs.a).toHaveLength(1);
    expect(buzzerData(g).round?.state).toBe("revealed");
    expect(applyAction(g, "b", { type: "next" }, ctx()).ok).toBe(false); // only the next player (a) or the host
    g = act(g, "a", { type: "next" }).game;
    expect(g.currentPlayerIndex).toBe(1);
    expect(buzzerData(g).round?.state).toBe("picking");
    expect(buzzerData(g).lastResult).toEqual({ type: "correct", byPlayerId: "a", byPlayerName: "A", song: { name: "Song t1", artist: "Artist", releaseYear: "1999", albumArt: null } });
  });

  it("only the picker can pick, judge, hint and reveal", () => {
    let g = started();
    expect(applyAction(g, "a", { type: "pickSong", track: track("t1") }, ctx()).ok).toBe(false);
    g = act(g, "h", { type: "pickSong", track: track("t1") }).game;
    expect(applyAction(g, "a", { type: "hint", field: "cover" }, ctx()).ok).toBe(false);
    expect(applyAction(g, "a", { type: "reveal" }, ctx()).ok).toBe(false);
    g = act(g, "b", { type: "buzz" }).game;
    expect(applyAction(g, "b", { type: "judge", verdict: "correct" }, ctx()).ok).toBe(false);
  });

  it("picker cannot buzz or skip their own song", () => {
    const g = act(started(), "h", { type: "pickSong", track: track("t1") }).game;
    expect(applyAction(g, "h", { type: "buzz" }, ctx()).ok).toBe(false);
    expect(applyAction(g, "h", { type: "skip" }, ctx()).ok).toBe(false);
  });

  it("cannot judge without a buzz", () => {
    const g = act(started(), "h", { type: "pickSong", track: track("t1") }).game;
    expect(applyAction(g, "h", { type: "judge", verdict: "correct" }, ctx()).ok).toBe(false);
  });

  it("wrong answer resumes playing and records the player", () => {
    let g = act(started(), "h", { type: "pickSong", track: track("t1") }).game;
    g = act(g, "a", { type: "buzz" }).game;
    const r = act(g, "h", { type: "judge", verdict: "wrong" });
    expect(buzzerData(r.game).round?.state).toBe("playing");
    expect(buzzerData(r.game).round?.wrongPlayers).toEqual(["a"]);
    expect(r.effects).toEqual([{ type: "play" }]);
    // maxBuzzesPerRound = 1 → no second buzz
    expect(applyAction(r.game, "a", { type: "buzz" }, ctx()).ok).toBe(false);
  });

  it("does not pause when autoPause is off", () => {
    let g = act(started({}, { autoPauseOnBuzz: false }), "h", { type: "pickSong", track: track("t1") }).game;
    expect(act(g, "a", { type: "buzz" }).effects).toEqual([]);
    g = act(g, "a", { type: "buzz" }).game;
    expect(act(g, "h", { type: "judge", verdict: "wrong" }).effects).toEqual([]);
  });

  it("respects disabled hints", () => {
    const g = act(started(), "h", { type: "pickSong", track: track("t1") }).game;
    expect(applyAction(g, "h", { type: "hint", field: "title" }, ctx()).ok).toBe(false); // title off by default
    expect(buzzerData(act(g, "h", { type: "hint", field: "artist" }).game).round?.revealed.artist).toBe(true);
  });

  it("only picker or host may control playback", () => {
    let g = started();
    g = act(g, "h", { type: "pickSong", track: track("t1") }).game;
    g = act(g, "h", { type: "reveal" }).game;
    g = act(g, "a", { type: "next" }).game; // now "a" is picker
    expect(applyAction(g, "b", { type: "seek", positionMs: 5000 }, ctx()).ok).toBe(false);
    expect(act(g, "a", { type: "seek", positionMs: 5000 }).effects).toEqual([{ type: "seek", positionMs: 5000 }]);
    expect(act(g, "h", { type: "pause" }).effects).toEqual([{ type: "pause" }]);
  });
});

describe("game end", () => {
  it("finishes after maxRounds full rotations", () => {
    let g = started({ maxRounds: 1 });
    // Each next player continues; after the last turn the active player opens the final standings
    for (const [picker, next] of [["h", "a"], ["a", "b"], ["b", "b"]]) {
      g = act(g, picker, { type: "pickSong", track: track(picker) }).game;
      g = act(g, picker, { type: "reveal" }).game;
      g = act(g, next, { type: "next" }).game;
    }
    expect(g.status).toBe("finished");
    expect(applyAction(g, "a", { type: "pickSong", track: track("x") }, ctx()).ok).toBe(false);
  });

  it("finishes when a player reaches the target score", () => {
    let g = started({ goal: "score", targetScore: 1 });
    g = act(g, "h", { type: "pickSong", track: track("t1") }).game;
    g = act(g, "a", { type: "buzz" }).game;
    g = act(g, "h", { type: "judge", verdict: "correct" }).game;
    expect(g.status).toBe("playing"); // result is shown first
    g = act(g, "h", { type: "next" }).game;
    expect(g.status).toBe("finished");
  });
});

describe("playback timer", () => {
  it("starts timers only once Spotify actually plays the song", async () => {
    const { buzzer } = await import("./modes/buzzer");
    const g = act(started(), "h", { type: "pickSong", track: track("t1") }).game;
    const data = buzzerData(g);
    expect(data.round?.playingAt).toBeUndefined();
    expect(buzzer.onPlaying!(data, "other", 5000)).toBe(false);
    expect(buzzer.onPlaying!(data, "t1", 5000)).toBe(true);
    expect(data.round?.playingAt).toBe(5000);
    expect(buzzer.onPlaying!(data, "t1", 9000)).toBe(false); // only the first time
  });
});

describe("playlist mode", () => {
  const playlist = [track("p1"), track("p2")];

  it("starts with the first track and cycles through", () => {
    let g = act(lobby(), "h", { type: "updateSettings", patch: { songSource: "playlist" } }).game;
    const start = act(g, "h", { type: "start" }, ctx({ playlist }));
    g = start.game;
    expect(buzzerData(g).round?.track?.id).toBe("p1");
    expect(start.effects).toEqual([{ type: "play", trackId: "p1" }]); // starts right away
    expect(applyAction(g, "h", { type: "pickSong", track: track("x") }, ctx({ playlist })).ok).toBe(false);
    g = act(g, "h", { type: "reveal" }, ctx({ playlist })).game;
    g = act(g, "a", { type: "next" }, ctx({ playlist })).game;
    expect(buzzerData(g).round?.track?.id).toBe("p2");
    g = act(g, "a", { type: "reveal" }, ctx({ playlist })).game;
    g = act(g, "b", { type: "next" }, ctx({ playlist })).game;
    expect(buzzerData(g).round?.track?.id).toBe("p1");
  });
});

describe("parseAction", () => {
  it("rejects unknown and malformed actions", () => {
    expect(parseAction(null, "buzzer")).toBeNull();
    expect(parseAction({ type: "hack" }, "buzzer")).toBeNull();
    expect(parseAction({ type: "hint", field: "lyrics" }, "buzzer")).toBeNull();
    expect(parseAction({ type: "seek", positionMs: "10" }, "buzzer")).toBeNull();
    expect(parseAction({ type: "pickSong", track: { id: "x" } }, "buzzer")).toBeNull();
  });

  it("normalizes valid actions", () => {
    expect(parseAction({ type: "buzz", extra: 1 }, "buzzer")).toEqual({ type: "buzz" });
    expect(parseAction({ type: "seek", positionMs: 1234.6 }, "buzzer")).toEqual({ type: "seek", positionMs: 1235 });
    expect(parseAction({ type: "setMode", mode: "buzzer" }, "buzzer")).toEqual({ type: "setMode", mode: "buzzer" });
    expect(parseAction({ type: "setMode", mode: "__proto__" }, "buzzer")).toBeNull();
    expect(parseAction({ type: "pickSong", track: { id: "x", name: "N", artist: "A" } }, "buzzer")).toEqual({
      type: "pickSong", track: { id: "x", name: "N", artist: "A", album: undefined, releaseYear: undefined, albumArt: null, previewUrl: null },
    });
  });
});
