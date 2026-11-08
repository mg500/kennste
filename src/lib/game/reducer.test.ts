import { describe, expect, it } from "vitest";
import { addPlayer, applyAction, continueVotesNeeded, continuingPlayer, newGame, parseAction, type Context } from "./reducer";
import { buzzerData, type BuzzerSettings } from "./modes/buzzer";
import { getMode, MODES, type ModeId } from "./modes";
import { yearData } from "./modes/year";
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
      { type: "updateModeSettings", patch: { buzzTimeLimit: 20 } },
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

  it("every mode brings its own goal – switching back from the timeline plays rounds again", () => {
    let g = act(lobby(), "h", { type: "setMode", mode: "timeline" }).game;
    expect(g.settings).toMatchObject({ goal: "score", targetScore: 10 });
    g = act(g, "h", { type: "setMode", mode: "buzzer" }).game;
    expect(g.settings).toMatchObject({ goal: "rounds", maxRounds: 5 });
  });

  it("validates settings ranges", () => {
    let g = act(lobby(), "h", { type: "updateSettings", patch: { maxRounds: 99, targetScore: 4 } }).game;
    g = act(g, "h", { type: "updateModeSettings", patch: { buzzTimeLimit: -1, playTimeLimit: 45 } }).game;
    expect(g.settings.maxRounds).toBe(5);
    expect(g.settings.targetScore).toBe(4);
    expect(buzzerData(g).settings.buzzTimeLimit).toBe(10);
    expect(buzzerData(g).settings.playTimeLimit).toBe(45);
  });

  it("only allows autoPause to change during a game", () => {
    const g = act(started(), "h", { type: "updateModeSettings", patch: { autoPauseOnBuzz: false, buzzTimeLimit: 30 } }).game;
    expect(buzzerData(g).settings.autoPauseOnBuzz).toBe(false);
    expect(buzzerData(g).settings.buzzTimeLimit).toBe(10);
    expect(applyAction(g, "h", { type: "updateSettings", patch: { maxRounds: 2 } }, ctx()).ok).toBe(false);
  });

  it("rejects mode actions outside of a running game", () => {
    expect(applyAction(lobby(), "a", { type: "buzz" }, ctx()).ok).toBe(false);
  });

  it("refuses to start playlist mode without tracks", () => {
    const g = act(lobby(), "h", { type: "setMode", mode: "year" }).game;
    expect(applyAction(g, "h", { type: "start" }, ctx()).ok).toBe(false);
  });

  it("players take turns in the order they joined", () => {
    expect(started().players.map(p => p.id)).toEqual(["h", "a", "b"]);
  });

  it("host cannot be kicked or made a viewer", () => {
    expect(applyAction(lobby(), "h", { type: "kick", playerId: "h" }, ctx()).ok).toBe(false);
    expect(applyAction(lobby(), "h", { type: "toggleViewer", playerId: "h" }, ctx()).ok).toBe(false);
  });
});

describe("start countdown", () => {
  it("counts down before the start; meanwhile nothing about the game changes, the host may cancel", () => {
    let g = act(lobby(), "h", { type: "countdown" }, ctx({ now: 1000 })).game;
    expect(g.status).toBe("lobby");
    expect(g.countdown).toEqual({ endsAt: 4000 });
    expect(act(g, "h", { type: "countdown" }, ctx({ now: 3000 })).game.countdown).toEqual({ endsAt: 4000 }); // pressed twice
    for (const action of [
      { type: "updateSettings", patch: { maxRounds: 3 } },
      { type: "setMode", mode: "year" },
      { type: "kick", playerId: "b" },
      { type: "toggleViewer", playerId: "b" },
    ] as Action[]) {
      expect(applyAction(g, "h", action, ctx())).toMatchObject({ ok: false, error: "Das Spiel startet gerade" });
    }
    expect(applyAction(g, "a", { type: "cancelCountdown" }, ctx()).ok).toBe(false);
    expect(act(g, "h", { type: "cancelCountdown" }).game.countdown).toBeUndefined();

    g = act(g, "h", { type: "start" }).game;
    expect(g.status).toBe("playing");
    expect(g.countdown).toBeUndefined();
  });

  it("only counts down what could start", () => {
    expect(applyAction(lobby(), "a", { type: "countdown" }, ctx())).toMatchObject({ ok: false, status: 403 });
    const playlist = act(lobby(), "h", { type: "setMode", mode: "year" }).game;
    expect(applyAction(playlist, "h", { type: "countdown" }, ctx())).toMatchObject({ ok: false, error: "Keine Playlist geladen" });
    expect(parseAction({ type: "countdown" }, "buzzer")).toEqual({ type: "countdown" });
    expect(parseAction({ type: "cancelCountdown" }, "buzzer")).toEqual({ type: "cancelCountdown" });
  });
});

describe("songs of the evening", () => {
  it("collects the songs of every game played in the lobby; a saved playlist stays", () => {
    const playlist = [track("p1"), track("p2"), track("p3")];
    const c = ctx({ playlist });
    const playRound = (g: Game) => {
      g = act(g, "h", { type: "reveal" }, c).game;
      return act(g, continuingPlayer(g)!.id, { type: "next" }, c).game;
    };
    let g = act(lobby(), "h", { type: "setMode", mode: "year" }, c).game;
    g = act(g, "h", { type: "updateSettings", patch: { maxRounds: 1 } }, c).game;
    expect(g.evening).toBeUndefined();
    g = act(g, "h", { type: "start" }, c).game;
    g = playRound(g);
    g = act(g, "h", { type: "reset" }, c).game;
    expect(g.evening?.songs).toEqual([expect.objectContaining({ trackId: "p1", name: "Song p1" })]);
    expect(g.evening?.games).toEqual([{ mode: "year", name: "Jahr schätzen", songs: 1, ranking: [{ name: "H", score: 0 }, { name: "A", score: 0 }, { name: "B", score: 0 }] }]);

    g = { ...g, savedPlaylist: { url: "https://open.spotify.com/playlist/x", songs: 1 } };
    g = act(g, "h", { type: "start" }, c).game;
    g = playRound(g);
    g = act(g, "h", { type: "reset" }, c).game;
    g = act(g, "h", { type: "start" }, c).game;
    g = act(g, "h", { type: "reset" }, c).game; // aborted before the reveal: p3 was drawn, but nobody saw it
    expect(g.evening?.games).toHaveLength(2);
    expect(g.evening?.songs.map(s => s.trackId)).toEqual(["p1", "p2"]);
    expect(g.savedPlaylist).toEqual({ url: "https://open.spotify.com/playlist/x", songs: 1 });
  });
});

describe("closing the lobby", () => {
  it("ends the evening: the running game joins it with its result, the music stops, nothing changes anymore", () => {
    const c = ctx({ playlist: [track("p1"), track("p2")] });
    let g = act(lobby(), "h", { type: "setMode", mode: "year" }, c).game;
    g = act(g, "h", { type: "start" }, c).game;
    for (const [id, year] of [["a", 1999], ["h", 1990], ["b", 1960]] as const) g = act(g, id, { type: "guess", year }, c).game;
    expect(applyAction(g, "a", { type: "close" }, c)).toMatchObject({ ok: false, status: 403 });

    const r = act(g, "h", { type: "close" }, { ...c, now: 5000 });
    expect(r.effects).toEqual([{ type: "pause" }]);
    g = r.game;
    expect(g.closedAt).toBe(5000);
    expect(g.status).toBe("lobby");
    expect(g.evening?.games).toEqual([{ mode: "year", name: "Jahr schätzen", songs: 1, ranking: [{ name: "A", score: 3 }, { name: "H", score: 0 }, { name: "B", score: 0 }] }]);
    expect(g.evening?.songs.map(s => s.trackId)).toEqual(["p1"]);
    for (const action of [{ type: "start" }, { type: "countdown" }, { type: "updateSettings", patch: { maxRounds: 3 } }, { type: "close" }] as Action[]) {
      expect(applyAction(g, "h", action, ctx())).toMatchObject({ ok: false, error: "Die Lobby ist geschlossen" });
    }
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

  it("host can abort a running game: everyone stays, scores reset, the music plays on", () => {
    let g = act(started(), "h", { type: "pickSong", track: track("t1") }).game;
    g = act(g, "a", { type: "buzz" }).game;
    g = act(g, "h", { type: "judge", verdict: "correct" }).game;
    expect(applyAction(g, "a", { type: "reset" }, ctx()).ok).toBe(false); // host only
    const r = act(g, "h", { type: "reset" });
    expect(r.game.status).toBe("lobby");
    expect(r.game.players.map(p => p.id)).toEqual(["h", "a", "b"]);
    expect(r.game.scores).toEqual({ h: 0, a: 0, b: 0 });
    expect(buzzerData(r.game).round).toBeUndefined();
    expect(r.effects).toEqual([]); // the store hands the music over to the lobby
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

  it("\"Keine Ahnung\" doesn't lock the buzzer: buzzing afterwards takes the skip back", () => {
    let g = act(started(), "h", { type: "pickSong", track: track("t1") }).game;
    g = act(g, "a", { type: "skip" }).game;
    g = act(g, "a", { type: "buzz" }).game;
    expect(buzzerData(g).round).toMatchObject({ state: "buzzed", buzzedBy: "a", skippedPlayers: [] });
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

describe("revealing on its own", () => {
  it("reveals once nobody can guess anymore (skipped or out of buzzes)", () => {
    let g = act(started(), "h", { type: "pickSong", track: track("t1") }).game;
    g = act(g, "a", { type: "skip" }).game;
    expect(buzzerData(g).round?.state).toBe("playing");
    g = act(g, "b", { type: "buzz" }).game;
    g = act(g, "h", { type: "judge", verdict: "wrong" }).game;
    expect(buzzerData(g).round?.state).toBe("revealed");
    expect(buzzerData(g).lastResult).toMatchObject({ type: "revealed", song: { name: "Song t1" } });
  });

  it("keeps playing while someone still has a buzz left – one buzz each", () => {
    let g = act(started(), "h", { type: "pickSong", track: track("t1") }).game;
    g = act(g, "b", { type: "buzz" }).game;
    g = act(g, "h", { type: "judge", verdict: "wrong" }).game;
    expect(buzzerData(g).round?.state).toBe("playing"); // A may still buzz
    expect(applyAction(g, "b", { type: "buzz" }, ctx()).ok).toBe(false);
  });

  it("reveals when the play time is up – after a pending buzz is judged wrong", async () => {
    const { buzzer } = await import("./modes/buzzer");
    let g = act(started({}, { playTimeLimit: 30 }), "h", { type: "pickSong", track: track("t1") }).game;
    expect(buzzer.deadline!(buzzerData(g))).toBeNull(); // not playing yet
    const data = structuredClone(buzzerData(g));
    buzzer.onPlaying!(data, "t1", 1000);
    g = { ...g, mode: data };
    expect(buzzer.deadline!(buzzerData(g))).toBe(31_000);
    expect(applyAction(g, "h", { type: "timeout" }, ctx({ now: 20_000 })).ok).toBe(false);
    expect(buzzerData(act(g, "h", { type: "timeout" }, ctx({ now: 31_000 })).game).round?.state).toBe("revealed");

    // Someone buzzed just before the time ran out: they may answer, a wrong answer ends the round
    g = act(g, "a", { type: "buzz" }, ctx({ now: 29_000 })).game;
    expect(buzzer.deadline!(buzzerData(g))).toBeNull();
    g = act(g, "h", { type: "judge", verdict: "wrong" }, ctx({ now: 35_000 })).game;
    expect(buzzerData(g).round?.state).toBe("revealed");
  });
});

describe("continue vote", () => {
  /** Buzzer game with h, a, b, c (c optionally a viewer) after h's revealed round: a continues. */
  function revealed(viewer?: string): Game {
    let g = lobby();
    g = addPlayer(g, { id: "c", name: "C", joinedAt: 3 })!;
    if (viewer) g = act(g, "h", { type: "toggleViewer", playerId: viewer }).game;
    g = act(g, "h", { type: "start" }).game;
    g = act(g, "h", { type: "pickSong", track: track("t1") }).game;
    return act(g, "h", { type: "reveal" }).game;
  }
  const vote = (g: Game, actor: string, want: boolean, now = 1000) => act(g, actor, { type: "voteContinue", want }, ctx({ now })).game;

  it("needs more than half of the others", () => {
    expect(continueVotesNeeded(revealed())).toBe(2); // 3 others
    expect(continueVotesNeeded(revealed("c"))).toBe(2); // 2 others: both
  });

  it("starts the countdown once a majority wants to continue, and stops it when they change their mind", () => {
    let g = revealed();
    expect(continuingPlayer(g)?.id).toBe("a");
    g = vote(g, "h", true);
    expect(g.continueVote).toEqual({ playerIds: ["h"] });
    g = vote(g, "b", true, 2000);
    expect(g.continueVote).toEqual({ playerIds: ["h", "b"], countdownAt: 2000 });
    // Another vote or a withdrawal that keeps the majority doesn't restart it
    g = vote(g, "c", true, 3000);
    g = vote(g, "b", false, 3500);
    expect(g.continueVote).toEqual({ playerIds: ["h", "c"], countdownAt: 2000 });
    g = vote(g, "h", false, 4000);
    expect(g.continueVote).toEqual({ playerIds: ["c"] });
    g = vote(g, "c", false);
    expect(g.continueVote).toBeUndefined();
  });

  it("only the other players may vote, and only after a revealed round", () => {
    const g = revealed("c");
    expect(applyAction(g, "a", { type: "voteContinue", want: true }, ctx()).ok).toBe(false); // continues anyway
    const viewer = applyAction(g, "c", { type: "voteContinue", want: true }, ctx());
    expect(viewer.ok || viewer.status).toBe(403);
    const playing = act(act(g, "a", { type: "next" }).game, "a", { type: "pickSong", track: track("t2") }).game;
    expect(applyAction(playing, "h", { type: "voteContinue", want: true }, ctx()).ok).toBe(false);
  });

  it("is cleared when the game continues", () => {
    let g = vote(vote(revealed(), "h", true), "b", true);
    g = act(g, "a", { type: "next" }).game;
    expect(g.continueVote).toBeUndefined();
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

describe("snippets", () => {
  it("starts songs at a random point instead of the intro", () => {
    const song = { ...track("t1"), durationMs: 200_000 };
    const r = act(started({}, { randomStart: true }), "h", { type: "pickSong", track: song }, ctx({ random: () => 0.5 }));
    expect(r.effects).toEqual([{ type: "play", trackId: "t1", positionMs: 85_000 }]); // 25 % + 0.5 × 35 %
    const plain = act(started(), "h", { type: "pickSong", track: song });
    expect(plain.effects).toEqual([{ type: "play", trackId: "t1" }]);
  });
});

describe("playlist mode", () => {
  const playlist = [track("p1"), track("p2")];

  it("starts with the first track and ends when every song was played", () => {
    let g = act(lobby(), "h", { type: "setMode", mode: "year" }).game;
    const start = act(g, "h", { type: "start" }, ctx({ playlist }));
    g = start.game;
    expect(yearData(g).round?.trackId).toBe("p1");
    expect(start.effects).toEqual([{ type: "play", trackId: "p1" }]); // starts right away
    g = act(g, "h", { type: "reveal" }, ctx({ playlist })).game;
    g = act(g, continuingPlayer(g)!.id, { type: "next" }, ctx({ playlist })).game;
    expect(yearData(g).round?.trackId).toBe("p2");
    g = act(g, "h", { type: "reveal" }, ctx({ playlist })).game;
    g = act(g, continuingPlayer(g)!.id, { type: "next" }, ctx({ playlist })).game;
    expect(g.status).toBe("finished");
    expect(g.outOfSongs).toBe(true);
  });

  it("continues a rematch with songs not played yet, a used-up playlist starts over", () => {
    const three = [...playlist, track("p3")];
    let g = act(lobby(), "h", { type: "setMode", mode: "year" }).game;
    g = act(g, "h", { type: "start" }, ctx({ playlist: three })).game;
    g = act(g, "h", { type: "reset" }, ctx({ playlist: three })).game;
    g = act(g, "h", { type: "start" }, ctx({ playlist: three })).game;
    expect(yearData(g).round?.trackId).toBe("p2");
    g = act(g, "h", { type: "reset" }, ctx({ playlist: three })).game;
    g = act(g, "h", { type: "start" }, ctx({ playlist: three })).game;
    g = act(g, "h", { type: "reset" }, ctx({ playlist: three })).game;
    g = act(g, "h", { type: "start" }, ctx({ playlist: three })).game;
    expect(yearData(g).round?.trackId).toBe("p1");
    expect(g.outOfSongs).toBeUndefined();
  });

  // Songs read later from the playlist skip these (see loadMoreSongs)
  it.each(Object.keys(MODES).filter(id => getMode(id as ModeId).requiresPlaylist) as ModeId[])(
    "%s counts the running song and the start cards as used",
    mode => {
      const songs = Array.from({ length: 12 }, (_, i) => ({ ...track(`p${i}`), releaseYear: String(1970 + i) }));
      let g = act(lobby(), "h", { type: "setMode", mode }).game;
      g = act(g, "h", { type: "start" }, ctx({ playlist: songs })).game;
      const m = getMode(mode);
      const used = m.usedTrackIds(g.mode);
      expect(used).toContain(m.currentTrackId(g.mode));
      // Everything dealt so far: the start cards, then the running song
      expect(new Set(used)).toEqual(new Set(songs.slice(0, g.playlistIndex! + 1).map(t => t.id)));
    },
  );
});

describe("song repeats", () => {
  it("rejects a song that already ran in this game", () => {
    let g = act(lobby(), "h", { type: "start" }).game;
    g = act(g, "h", { type: "pickSong", track: track("x") }).game;
    g = act(g, "h", { type: "reveal" }).game;
    const next = continuingPlayer(g)!.id;
    g = act(g, next, { type: "next" }).game;
    const picker = g.players[g.currentPlayerIndex].id;
    expect(applyAction(g, picker, { type: "pickSong", track: track("x") }, ctx()).ok).toBe(false);
    expect(applyAction(g, picker, { type: "pickSong", track: track("y") }, ctx()).ok).toBe(true);
  });
});

describe("parseAction", () => {
  it("rejects unknown and malformed actions", () => {
    expect(parseAction(null, "buzzer")).toBeNull();
    expect(parseAction({ type: "hack" }, "buzzer")).toBeNull();
    expect(parseAction({ type: "hint", field: "lyrics" }, "buzzer")).toBeNull();
    expect(parseAction({ type: "seek", positionMs: "10" }, "buzzer")).toBeNull();
    expect(parseAction({ type: "pickSong", track: { id: "x" } }, "buzzer")).toBeNull();
    expect(parseAction({ type: "voteContinue", want: "yes" }, "buzzer")).toBeNull();
  });

  // Only the server ends a round when its time is up (see scheduleDeadline)
  it.each(Object.keys(MODES) as ModeId[])("%s doesn't take a timeout from a device", mode => {
    expect(parseAction({ type: "timeout" }, mode)).toBeNull();
  });

  it("normalizes valid actions", () => {
    expect(parseAction({ type: "buzz", extra: 1 }, "buzzer")).toEqual({ type: "buzz" });
    expect(parseAction({ type: "seek", positionMs: 1234.6 }, "buzzer")).toEqual({ type: "seek", positionMs: 1235 });
    expect(parseAction({ type: "setMode", mode: "buzzer" }, "buzzer")).toEqual({ type: "setMode", mode: "buzzer" });
    expect(parseAction({ type: "setMode", mode: "__proto__" }, "buzzer")).toBeNull();
    expect(parseAction({ type: "voteContinue", want: false, playerId: "x" }, "buzzer")).toEqual({ type: "voteContinue", want: false });
    expect(parseAction({ type: "pickSong", track: { id: "x", name: "N", artist: "A" } }, "buzzer")).toEqual({
      type: "pickSong", track: { id: "x", name: "N", artist: "A", album: undefined, releaseYear: undefined, albumArt: null, previewUrl: null },
    });
    // The ISRC lets the server look up the original release year of a picked song
    const picked = (isrc: unknown) => parseAction({ type: "pickSong", track: { id: "x", name: "N", artist: "A", isrc } }, "buzzer");
    expect(picked("GBUM71029604")).toMatchObject({ track: { isrc: "GBUM71029604" } });
    expect(picked("<script>")).toMatchObject({ track: { isrc: undefined } });
  });
});

describe("history", () => {
  it("buzzer quiz: records who put the song on, who buzzed and who got it", () => {
    let g = act(started({ songSource: "players" }), "h", { type: "pickSong", track: track("t1") }).game;
    g = act(g, "a", { type: "buzz" }).game;
    g = act(g, "h", { type: "judge", verdict: "correct" }).game;
    expect(g.history).toEqual([{
      round: 1, song: expect.objectContaining({ trackId: "t1" }), points: { a: 1 }, pickedBy: "h",
      stats: { a: { buzzes: 1, rightMs: undefined }, b: {} },
    }]);
  });
});
