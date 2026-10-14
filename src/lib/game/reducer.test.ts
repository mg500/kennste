import { describe, expect, it } from "vitest";
import { addPlayer, applyAction, newGame, parseAction, type Context } from "./reducer";
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

function started(settings: Partial<Game["settings"]> = {}): Game {
  const g = act(lobby(), "h", { type: "updateSettings", patch: settings }).game;
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
    const g = act(lobby(), "h", { type: "updateSettings", patch: { maxRounds: 99, bestOf: 4, buzzTimeLimit: -1 } }).game;
    expect(g.settings.maxRounds).toBe(5);
    expect(g.settings.bestOf).toBe(4);
    expect(g.settings.buzzTimeLimit).toBe(10);
  });

  it("only allows autoPause to change during a game", () => {
    const g = act(started(), "h", { type: "updateSettings", patch: { autoPauseOnBuzz: false, maxRounds: 2 } }).game;
    expect(g.settings.autoPauseOnBuzz).toBe(false);
    expect(g.settings.maxRounds).toBe(5);
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
});

describe("round flow", () => {
  it("picker picks, guesser buzzes, picker judges correct", () => {
    let g = started();
    const pick = act(g, "h", { type: "pickSong", track: track("t1") });
    expect(pick.effects).toEqual([{ type: "play", trackId: "t1" }]);
    g = pick.game;
    expect(g.round?.state).toBe("playing");

    const buzz = act(g, "a", { type: "buzz" });
    expect(buzz.effects).toEqual([{ type: "pause" }]);
    g = buzz.game;
    expect(g.round?.buzzedBy).toBe("a");

    g = act(g, "h", { type: "judge", verdict: "correct" }).game;
    expect(g.scores.a).toBe(1);
    expect(g.guessedSongs.a).toHaveLength(1);
    expect(g.currentPlayerIndex).toBe(1);
    expect(g.round?.state).toBe("picking");
    expect(g.lastResult).toEqual({ type: "correct", byPlayerName: "A", song: { name: "Song t1", artist: "Artist", releaseYear: "1999", albumArt: null } });
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
    expect(r.game.round?.state).toBe("playing");
    expect(r.game.round?.wrongPlayers).toEqual(["a"]);
    expect(r.effects).toEqual([{ type: "play" }]);
    // maxBuzzesPerRound = 1 → no second buzz
    expect(applyAction(r.game, "a", { type: "buzz" }, ctx()).ok).toBe(false);
  });

  it("does not pause when autoPause is off", () => {
    let g = act(started({ autoPauseOnBuzz: false }), "h", { type: "pickSong", track: track("t1") }).game;
    expect(act(g, "a", { type: "buzz" }).effects).toEqual([]);
    g = act(g, "a", { type: "buzz" }).game;
    expect(act(g, "h", { type: "judge", verdict: "wrong" }).effects).toEqual([]);
  });

  it("respects disabled hints", () => {
    const g = act(started(), "h", { type: "pickSong", track: track("t1") }).game;
    expect(applyAction(g, "h", { type: "hint", field: "title" }, ctx()).ok).toBe(false); // title off by default
    expect(act(g, "h", { type: "hint", field: "artist" }).game.round?.hintArtistRevealed).toBe(true);
  });

  it("only picker or host may control playback", () => {
    let g = started();
    g = act(g, "h", { type: "pickSong", track: track("t1") }).game;
    g = act(g, "h", { type: "reveal" }).game; // now "a" is picker
    expect(applyAction(g, "b", { type: "seek", positionMs: 5000 }, ctx()).ok).toBe(false);
    expect(act(g, "a", { type: "seek", positionMs: 5000 }).effects).toEqual([{ type: "seek", positionMs: 5000 }]);
    expect(act(g, "h", { type: "pause" }).effects).toEqual([{ type: "pause" }]);
  });
});

describe("game end", () => {
  it("finishes after maxRounds full rotations", () => {
    let g = started({ maxRounds: 1 });
    for (const picker of ["h", "a", "b"]) {
      g = act(g, picker, { type: "pickSong", track: track(picker) }).game;
      g = act(g, picker, { type: "reveal" }).game;
    }
    expect(g.status).toBe("finished");
    expect(g.round).toBeUndefined();
  });

  it("finishes in bestOf mode when a player reaches the target", () => {
    let g = started({ gameMode: "bestOf", bestOf: 1 });
    g = act(g, "h", { type: "pickSong", track: track("t1") }).game;
    g = act(g, "a", { type: "buzz" }).game;
    g = act(g, "h", { type: "judge", verdict: "correct" }).game;
    expect(g.status).toBe("finished");
  });
});

describe("playlist mode", () => {
  const playlist = [track("p1"), track("p2")];

  it("starts with the first track and cycles through", () => {
    let g = act(lobby(), "h", { type: "updateSettings", patch: { songSource: "playlist" } }).game;
    g = act(g, "h", { type: "start" }, ctx({ playlist })).game;
    expect(g.round?.trackId).toBe("p1");
    expect(applyAction(g, "h", { type: "pickSong", track: track("x") }, ctx({ playlist })).ok).toBe(false);
    g = act(g, "h", { type: "reveal" }, ctx({ playlist })).game;
    expect(g.round?.trackId).toBe("p2");
    g = act(g, "a", { type: "reveal" }, ctx({ playlist })).game;
    expect(g.round?.trackId).toBe("p1");
  });
});

describe("parseAction", () => {
  it("rejects unknown and malformed actions", () => {
    expect(parseAction(null)).toBeNull();
    expect(parseAction({ type: "hack" })).toBeNull();
    expect(parseAction({ type: "hint", field: "lyrics" })).toBeNull();
    expect(parseAction({ type: "seek", positionMs: "10" })).toBeNull();
    expect(parseAction({ type: "pickSong", track: { id: "x" } })).toBeNull();
  });

  it("normalizes valid actions", () => {
    expect(parseAction({ type: "buzz", extra: 1 })).toEqual({ type: "buzz" });
    expect(parseAction({ type: "seek", positionMs: 1234.6 })).toEqual({ type: "seek", positionMs: 1235 });
    expect(parseAction({ type: "pickSong", track: { id: "x", name: "N", artist: "A" } })).toEqual({
      type: "pickSong", track: { id: "x", name: "N", artist: "A", album: undefined, releaseYear: undefined, albumArt: null, previewUrl: null },
    });
  });
});
