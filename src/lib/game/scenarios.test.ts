import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as musicRoute from "@/app/api/game/[id]/music/route";
import * as searchRoute from "@/app/api/game/[id]/search/route";
import * as browseRoute from "@/app/api/game/[id]/browse/route";
import * as randomRoute from "@/app/api/game/[id]/random/route";
import * as playlistRoute from "@/app/api/game/[id]/playlist/route";
import * as playlistSearchRoute from "@/app/api/game/[id]/playlist-search/route";
import * as savePlaylistRoute from "@/app/api/game/[id]/save-playlist/route";
import * as gameRoute from "@/app/api/game/[id]/route";
import * as joinRoute from "@/app/api/game/[id]/join/route";
import * as eventsRoute from "@/app/api/game/[id]/events/route";
import { createSpotifySim, trackFixture, type SimPlaylist, type SpotifySim } from "@/test/spotifySim";
import { hostKey, markPlayed, resetPlayedSongs } from "../playedSongs";
import { withOriginalYear } from "../releaseYear";
import { timing } from "../spotify";
import { getMode } from "./modes";
import { buzzerData } from "./modes/buzzer";
import { yearData } from "./modes/year";
import { closeGame, createGame, deleteAllGames, dispatch, getGame, getHostSession, getPlaylist, joinGame, refreshPlayback, setDevice, subscribe } from "./store";
import { PLAYER_TOKEN_HEADER, type Action, type GameEvent, type Playback } from "./types";

// Whole flows against the Spotify simulator: what the unit tests can't see (several requests in a row,
// Spotify's player state before and after).

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const post = (body: unknown, token: string) => new Request("http://test/", {
  method: "POST", headers: { "Content-Type": "application/json", [PLAYER_TOKEN_HEADER]: token }, body: JSON.stringify(body),
});
/** As after the login: valid for an hour from the time the game is created. */
const auth = () => ({ accessToken: "token", refreshToken: "refresh", expiresAt: Date.now() + 3600_000 });

function catalog(count: number) {
  return Array.from({ length: count }, (_, i) => trackFixture(i));
}
function playlist(id: string, count: number, own = false, from = 0): SimPlaylist {
  return { id, name: `Playlist ${id}`, owner: own ? "me" : "Spotify", own, trackIds: Array.from({ length: count }, (_, i) => `t${from + i}`) };
}

let sim: SpotifySim;
function install(s: SpotifySim) {
  sim = s;
  vi.stubGlobal("fetch", s.fetch);
}

/** A game with the host and `others` more players; `userId`: the host's login (for the songs played before). */
function setup(others: number, userId: string | null = null) {
  const host = createGame("Host", auth(), userId);
  const players = [host, ...Array.from({ length: others }, (_, i) => joinGame(host.game.id, `P${i + 1}`)!)];
  const id = host.game.id;
  const act = async (playerId: string, action: Action) => {
    const r = await dispatch(id, playerId, action);
    if (!r.ok) throw new Error(`${action.type}: ${r.error}`);
    return r.game;
  };
  const loadPlaylist = async (playlistId: string) => {
    const res = await playlistRoute.POST(post({ playlistId }, host.token), ctx(id));
    return { status: res.status, body: await res.json() };
  };
  return { id, host, players, act, loadPlaylist };
}

beforeEach(() => { timing.scale = 0; });
// A delayed playback poll of an earlier test's game would refresh its token against this test's simulator, which
// rotates refresh tokens like Spotify – and leave this test's game with an invalid one
afterEach(() => { deleteAllGames(); resetPlayedSongs(); timing.scale = 1; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("foreign playlist through a whole game", () => {
  let calls = 0;
  it.each<[string, number | (() => number)]>([
    ["starts the playlist where asked", 0],
    ["starts one song late (Spotify on a Mac)", 1],
    ["sometimes starts one song late", () => calls++ % 2],
  ])("loads more songs in time, never repeats one and ends when all were played – Spotify %s", async (_, offsetShift) => {
    install(createSpotifySim({ tracks: catalog(70), playlists: [playlist("pl", 70)], lag: 2, offsetShift }));
    sim.player.shuffle = true; // the host listens in shuffle mode
    vi.spyOn(Math, "random").mockReturnValue(0); // the first block first
    const { id, players, act, loadPlaylist } = setup(3);
    const [host] = players;
    await act(host.playerId, { type: "setMode", mode: "year" });
    await act(host.playerId, { type: "updateSettings", patch: { goal: "score", targetScore: 20 } }); // nobody guesses: plays to the end

    const loaded = await loadPlaylist("pl");
    expect(loaded.status).toBe(200);
    expect(loaded.body.playlistTrackCount).toBe(21);
    // Read from the first block, then it plays on in the lobby from the block read last
    const positions = sim.plays.map(p => Number(p.split("@")[1]));
    expect(positions).toHaveLength(2);
    expect(positions[0]).toBe(0);
    expect(positions[1]).toBeGreaterThanOrEqual(60); // the Mac starts one song late

    let game = await act(host.playerId, { type: "start" });
    expect(game.playlistTrackCount).toBeGreaterThanOrEqual(30); // enough for the start
    const queueReads = () => sim.calls.filter(c => c === "GET /me/player/queue").length;

    const played: string[] = [];
    while (game.status === "playing") {
      played.push(yearData(game).round!.trackId);
      // Songs are only read while the music changes anyway: never during a round
      const before = queueReads();
      game = await act(host.playerId, { type: "reveal" });
      expect(queueReads()).toBe(before);
      game = await act(host.playerId, { type: "next" });
    }

    expect(new Set(played).size).toBe(played.length);
    expect(played.length).toBeGreaterThanOrEqual(69); // at most one song gets lost at the playlist's start or end
    expect(played.every(t => sim.playlists.get("pl")!.trackIds.includes(t))).toBe(true); // no autoplay songs
    expect(game.outOfSongs).toBe(true);
    expect(getGame(id)?.playlistLoading).toBeUndefined();
  });

  it("reads the queue with shuffle off, then the playlist plays on – in the host's shuffle mode, away from the songs read", async () => {
    install(createSpotifySim({ tracks: catalog(130), playlists: [playlist("pl", 50), playlist("mine", 10, true, 100)], lag: 2 }));
    // The host listens to an album in shuffle mode
    sim.player.shuffle = true;
    await sim.fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT", body: JSON.stringify({ context_uri: "spotify:album:al120", offset: { uri: "spotify:track:t120" }, position_ms: 42_000 }),
    });
    sim.settle(); // it has been playing for a while
    const { loadPlaylist } = setup(1);

    const { body } = await loadPlaylist("pl");
    const block = sim.plays.find(p => p.startsWith("spotify:playlist:pl"))!;
    const start = Number(block.split("@")[1]);
    const ids = sim.playlists.get("pl")!.trackIds;
    const expected = ids.slice(start, Math.min(start + 21, ids.length - 1)); // the last block leaves out the final song
    expect(body.playlistTrackCount).toBe(expected.length);
    const shuffleOff = sim.calls.findIndex(c => c.startsWith("PUT /me/player/shuffle?state=false"));
    const firstRead = sim.calls.indexOf("GET /me/player/queue");
    expect(shuffleOff).toBeGreaterThan(-1);
    expect(shuffleOff).toBeLessThan(firstRead);

    sim.settle();
    expect(sim.player.shuffle).toBe(true);
    expect(sim.player.contextUri).toBe("spotify:playlist:pl");
    expect(sim.player.isPlaying).toBe(true);
    expect(expected).not.toContain(sim.current()?.id); // not a song the game starts with
  });

  it("a short foreign playlist (one block) plays on too, also when nothing played before", async () => {
    install(createSpotifySim({ tracks: catalog(30), playlists: [playlist("short", 15)] }));
    const { loadPlaylist } = setup(1);
    expect(sim.player.isPlaying).toBe(false);
    const { body } = await loadPlaylist("short");
    expect(body.playlistTrackCount).toBe(14); // the last song is left out, see BLOCK_STRIDE
    sim.settle();
    expect(sim.player.contextUri).toBe("spotify:playlist:short");
    expect(sim.player.isPlaying).toBe(true);
  });

  it("reads the whole block although the device hands out only part of the queue at first", async () => {
    install(createSpotifySim({ tracks: catalog(80), playlists: [playlist("pl", 60)], shortQueueReads: 1 }));
    vi.spyOn(Math, "random").mockReturnValue(0); // the first block, not the shorter last one
    const { loadPlaylist } = setup(1);
    const { body } = await loadPlaylist("pl");
    expect(body.playlistTrackCount).toBe(21);
  });

  it("two playlists picked right after each other: the second one plays", async () => {
    install(createSpotifySim({ tracks: catalog(130), playlists: [playlist("a", 50), playlist("b", 50, false, 50)], lag: 2 }));
    const { loadPlaylist } = setup(1);
    await loadPlaylist("a");
    await loadPlaylist("b");
    sim.settle();
    expect(sim.player.contextUri).toBe("spotify:playlist:b");
    expect(sim.player.isPlaying).toBe(true);
  });

  it("loads own playlists completely, also beyond 100 songs, without the queue – then it plays", async () => {
    install(createSpotifySim({ tracks: catalog(150), playlists: [playlist("mine", 150, true)] }));
    const { loadPlaylist } = setup(1);
    const { body } = await loadPlaylist("mine");
    expect(body.playlistTrackCount).toBe(150);
    expect(sim.calls).not.toContain("GET /me/player/queue");
    expect(sim.calls.filter(c => c.startsWith("PUT /me/player"))).toEqual([expect.stringMatching(/^PUT \/me\/player\/play/)]);
    expect(sim.player.contextUri).toBe("spotify:playlist:mine");
  });

  it("songs heard in the lobby come last in the game", async () => {
    install(createSpotifySim({ tracks: catalog(30), playlists: [playlist("mine", 30, true)] }));
    const { id, host, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("mine");
    const heard = sim.current()!.id;
    refreshPlayback(id);
    await new Promise(r => setTimeout(r, 700)); // the server looks at what plays
    await act(host.playerId, { type: "start" });
    const order = getPlaylist(id)!.map(t => t.id);
    expect(order.at(-1)).toBe(heard);
    expect(yearData(getGame(id)!).round?.trackId).not.toBe(heard);
  });
});

describe("the lobby's song and the game's first song", () => {
  it("what plays in the lobby right at the start isn't the first song, even when the server hasn't seen it yet", async () => {
    install(createSpotifySim({ tracks: catalog(30), playlists: [playlist("mine", 30, true)] }));
    const { id, host, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("mine");
    refreshPlayback(id);
    await new Promise(r => setTimeout(r, 700)); // the server sees the first song in the lobby
    // The lobby's playlist moves on to the song that would come first in the game, right before the start
    const first = getPlaylist(id)!.find(t => t.id !== sim.current()!.id)!.id;
    sim.player.index = sim.player.order.indexOf(first);
    await act(host.playerId, { type: "start" });
    expect(yearData(getGame(id)!).round?.trackId).not.toBe(first);
    expect(getPlaylist(id)!.slice(-2).map(t => t.id)).toContain(first); // with the one heard before
  });

  it("songs that played for a moment while a foreign playlist was read come last", async () => {
    install(createSpotifySim({ tracks: catalog(70), playlists: [playlist("pl", 70)] }));
    vi.spyOn(Math, "random").mockReturnValue(0); // the first block first
    const { id, host, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("pl"); // reads from t0, then plays on from the last block
    await act(host.playerId, { type: "start" }); // reads the next block from t20
    const order = getPlaylist(id)!.map(t => t.id);
    const heardAt = (trackId: string) => order.length - order.indexOf(trackId);
    expect(heardAt("t0")).toBeLessThanOrEqual(3);
    expect(heardAt("t20")).toBeLessThanOrEqual(3);
    expect(["t0", "t20"]).not.toContain(yearData(getGame(id)!).round?.trackId);
  });

  it("a new round starts its song from the beginning even if it already plays in the lobby", async () => {
    install(createSpotifySim({ tracks: catalog(1), playlists: [playlist("mine", 1, true)] }));
    const { id, host, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("mine"); // plays on in the lobby
    refreshPlayback(id);
    await new Promise(r => setTimeout(r, 700));
    sim.player.progressMs = 120_000;
    const plays = sim.plays.length;
    await act(host.playerId, { type: "start" }); // the only song left is the one from the lobby
    expect(sim.plays.slice(plays)).toEqual(["spotify:album:al0@spotify:track:t0"]);
    expect(sim.player.progressMs).toBeLessThan(120_000);
  });
});

describe("songs played before", () => {
  it("a playlist played again – in the same lobby or a later one – brings new songs first", async () => {
    install(createSpotifySim({ tracks: catalog(10), playlists: [playlist("mine", 10, true)] }));
    const firstSongs: string[] = [];
    for (let lobby = 0; lobby < 2; lobby++) {
      const { id, host, act, loadPlaylist } = setup(1, "host@example.de");
      await act(host.playerId, { type: "setMode", mode: "year" });
      for (let game = 0; game < 5; game++) {
        await loadPlaylist("mine"); // picked again: shuffled anew
        await act(host.playerId, { type: "start" });
        firstSongs.push(yearData(getGame(id)!).round!.trackId);
        await act(host.playerId, { type: "reset" });
      }
      await closeGame(id);
    }
    expect(new Set(firstSongs).size).toBe(10);
  });

  it("a foreign playlist reads further blocks instead of repeating songs of earlier games", async () => {
    install(createSpotifySim({ tracks: catalog(70), playlists: [playlist("pl", 70)] }));
    vi.spyOn(Math, "random").mockReturnValue(0); // the first block first
    // Earlier games of this host played the first two blocks
    const before = Array.from({ length: 41 }, (_, i) => `t${i}`);
    markPlayed(hostKey("host@example.de"), before, Date.now() - 1000);
    const { id, host, act, loadPlaylist } = setup(1, "host@example.de");
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("pl");
    await act(host.playerId, { type: "start" });
    expect(before).not.toContain(yearData(getGame(id)!).round!.trackId);
    const upcoming = getPlaylist(id)!.slice(0, 20).map(t => t.id);
    expect(upcoming.filter(t => before.includes(t))).toEqual([]);
  });
});

describe("the end of a round's song", () => {
  /** Every song on one album: after a song, Spotify plays the album's next one. Own IDs: the app caches each song's album. */
  const oneAlbum = () => createSpotifySim({
    tracks: Array.from({ length: 5 }, (_, i) => trackFixture(500 + i, { albumId: "best-of" })), playlists: [playlist("mine", 5, true, 500)],
  });
  async function playing() {
    install(oneAlbum());
    const { id, host, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await act(host.playerId, { type: "updateModeSettings", patch: { guessTimeLimit: 0 } }); // the round outlasts the song
    await loadPlaylist("mine");
    await act(host.playerId, { type: "start" });
    const trackId = yearData(getGame(id)!).round!.trackId;
    expect(sim.current()?.id).toBe(trackId);
    return { id, trackId };
  }
  const poll = async (id: string) => { refreshPlayback(id); await new Promise(r => setTimeout(r, 700)); };

  it("Spotify moved on to the album's next song while the round still runs: the server pauses", async () => {
    const { id, trackId } = await playing();
    sim.player.progressMs = 200_000 - 3500;
    await poll(id); // the round's song plays, close to its end
    sim.finishSong();
    expect(sim.current()?.id).not.toBe(trackId);
    await poll(id);
    await new Promise(r => setTimeout(r, 50));
    expect(sim.player.isPlaying).toBe(false);
  });

  it("right before the song ends, the server pauses, so the album's next song doesn't start", async () => {
    const { id, trackId } = await playing();
    sim.player.progressMs = 200_000 - 800;
    await poll(id);
    await new Promise(r => setTimeout(r, 200));
    expect(sim.player.isPlaying).toBe(false);
    expect(sim.current()?.id).toBe(trackId);
  });

  it("doesn't pause other music someone puts on by hand during the game", async () => {
    const { id } = await playing();
    sim.player.progressMs = 10_000;
    await poll(id);
    sim.finishSong(); // far from the end: not Spotify moving on by itself
    await poll(id);
    expect(sim.player.isPlaying).toBe(true);
  });
});

describe("back in the lobby, the music plays on", () => {
  const oneAlbum = () => createSpotifySim({
    tracks: Array.from({ length: 5 }, (_, i) => trackFixture(500 + i, { albumId: "best-of" })), playlists: [playlist("mine", 5, true, 500)],
  });
  async function playing() {
    install(oneAlbum());
    const { id, host, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await act(host.playerId, { type: "updateModeSettings", patch: { guessTimeLimit: 0 } });
    await loadPlaylist("mine");
    await act(host.playerId, { type: "start" });
    const trackId = yearData(getGame(id)!).round!.trackId;
    return { id, host, act, trackId };
  }
  const poll = async (id: string) => { refreshPlayback(id); await new Promise(r => setTimeout(r, 700)); };

  it("aborting a game keeps the round's song playing; at its end the game's playlist takes over, not the album", async () => {
    const { id, host, act, trackId } = await playing();
    sim.player.progressMs = 60_000;
    await act(host.playerId, { type: "reset" });
    await poll(id);
    expect(sim.player.isPlaying).toBe(true);
    expect(sim.current()?.id).toBe(trackId);
    expect(sim.player.contextUri).not.toBe("spotify:playlist:mine"); // still the round's song, started via its album

    sim.player.progressMs = 200_000 - 800; // close to its end
    await poll(id);
    await waitFor(() => sim.player.contextUri === "spotify:playlist:mine");
    expect(sim.player.isPlaying).toBe(true);
  });

  it("if Spotify already moved on to the album's next song, the playlist takes over then", async () => {
    const { id, host, act, trackId } = await playing();
    sim.player.progressMs = 60_000;
    await act(host.playerId, { type: "reset" });
    await poll(id);
    sim.finishSong();
    expect(sim.current()?.id).not.toBe(trackId);
    await poll(id);
    await waitFor(() => sim.player.contextUri === "spotify:playlist:mine");
  });

  it("with nothing playing (the song was over), the playlist starts right away", async () => {
    const { id, host, act } = await playing();
    sim.player.isPlaying = false;
    await act(host.playerId, { type: "reset" });
    await waitFor(() => sim.player.contextUri === "spotify:playlist:mine" && sim.player.isPlaying);
    expect(getGame(id)!.status).toBe("lobby");
  });

  it("music the host puts on in the lobby stays", async () => {
    const { id, host, act } = await playing();
    sim.player.progressMs = 60_000;
    await act(host.playerId, { type: "reset" });
    await poll(id);
    expect((await musicRoute.POST(post({ trackId: "t503" }, host.token), ctx(id))).status).toBe(200);
    sim.player.progressMs = 200_000 - 800;
    await poll(id);
    await new Promise(r => setTimeout(r, 300));
    expect(sim.current()?.id).toBe("t503");
    expect(sim.player.contextUri).not.toBe("spotify:playlist:mine");
  });
});

describe("lobby music", () => {
  it("shows title and cover in the lobby only, never during the game", async () => {
    install(createSpotifySim({ tracks: catalog(30), playlists: [playlist("pl", 30, true)] }));
    const { id, host, act, loadPlaylist } = setup(1);
    const events: Playback[] = [];
    subscribe(id, (e: GameEvent) => { if (e.type === "playback") events.push(e.playback); });
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("pl");

    const res = await musicRoute.POST(post({ trackId: "t5" }, host.token), ctx(id));
    expect(res.status).toBe(200);
    expect(sim.current()?.id).toBe("t5");
    await waitFor(() => events.some(p => p.track?.name === "Song 5"));

    await act(host.playerId, { type: "start" });
    const atStart = events.length;
    refreshPlayback(id);
    await waitFor(() => events.length > atStart);
    expect(events.slice(atStart).every(p => p.track === undefined)).toBe(true);
    expect((await musicRoute.POST(post({ pause: true }, host.token), ctx(id))).status).toBe(400); // lobby only
  });
});

describe("what each device sees", () => {
  /** The first game state a device gets over its event stream. */
  async function firstState(id: string, token?: string) {
    const res = await eventsRoute.GET(new Request(`http://test/api/game/${id}/events${token ? `?token=${token}` : ""}`), ctx(id));
    const reader = res.body!.getReader();
    const chunk = new TextDecoder().decode((await reader.read()).value);
    await reader.cancel();
    return JSON.parse(chunk.replace(/^data: /, "")).game;
  }

  it("no phone and no TV learns the running song before the reveal – not even its Spotify ID", async () => {
    install(createSpotifySim({ tracks: catalog(10), playlists: [playlist("pl", 10, true)] }));
    const { id, host, players, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("pl");
    await act(host.playerId, { type: "start" });
    const song = getPlaylist(id)!.find(t => t.id === yearData(getGame(id)!).round!.trackId)!;
    await act(players[1].playerId, { type: "guess", year: 1977, draft: true });

    // The player's own stream (the token says who it is) has their year, the host's and the TV's only the song's stand-in
    const own = await firstState(id, players[1].token);
    expect(yearData(own).round?.drafts).toEqual({ [players[1].playerId]: 1977 });
    for (const state of [await firstState(id, host.token), await firstState(id)]) {
      const json = JSON.stringify(state);
      expect(json).not.toContain(song.id);
      expect(json).not.toContain(song.name);
      expect(json).not.toContain("1977");
    }
    const asGuest = await (await gameRoute.GET(new Request("http://test/"), ctx(id))).json();
    expect(JSON.stringify(asGuest)).not.toContain(song.id);
  });

  it("the playback bar still finds the song, and the host can start it again", async () => {
    install(createSpotifySim({ tracks: catalog(10), playlists: [playlist("pl", 10, true)] }));
    const { id, host, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "timeline" });
    await loadPlaylist("pl");
    const events: GameEvent[] = [];
    subscribe(id, e => events.push(e), { viewer: host.playerId });
    await act(host.playerId, { type: "start" });
    const songId = getMode("timeline").currentTrackId(getGame(id)!.mode);
    const lastState = () => events.filter(e => e.type === "game").at(-1)!.game;
    const standIn = () => getMode("timeline").currentTrackId(lastState().mode);
    await waitFor(() => events.some(e => e.type === "playback" && e.playback.trackId === standIn()));
    expect(standIn()).not.toBe(songId);

    // "Nochmal von vorn" names the song by its stand-in; Spotify plays the real one
    const result = await dispatch(id, host.playerId, { type: "play", trackId: standIn() });
    expect(result).toMatchObject({ ok: true, spotifyError: undefined });
    expect(sim.current()?.id).toBe(songId);
  });
});

describe("time limits", () => {
  it("the server ends the round when the time is up – even if every phone is in the background", async () => {
    install(createSpotifySim({ tracks: catalog(10), playlists: [playlist("pl", 10, true)] }));
    const { id, host, players, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await act(host.playerId, { type: "updateModeSettings", patch: { guessTimeLimit: 1 } });
    await loadPlaylist("pl");
    subscribe(id, () => {}); // a connected client, so the server watches Spotify and starts the time limit
    await act(host.playerId, { type: "start" });
    await waitFor(() => !!yearData(getGame(id)!).round?.playingAt);
    // One player has picked a year but never pressed "Fertig", the other did nothing; nobody sends "timeout"
    await act(players[1].playerId, { type: "guess", year: 1990, draft: true });

    await waitFor(() => yearData(getGame(id)!).round?.state === "revealed");
    expect(yearData(getGame(id)!).round?.guesses).toEqual({ [players[1].playerId]: 1990 });
  });
});

describe("start countdown", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("the server reads the songs during the countdown and starts by itself when it ends", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    install(createSpotifySim({ tracks: catalog(70), playlists: [playlist("pl", 70)] }));
    const { id, host, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("pl");
    expect(getGame(id)!.playlistTrackCount).toBeLessThan(30);

    await act(host.playerId, { type: "countdown" });
    // Prepared within the countdown: songs read, years checked – nobody has to press anything
    await waitFor(() => !!getGame(id)!.countdown?.years);
    expect(getGame(id)!.countdown!.songs).toBeGreaterThanOrEqual(30);
    expect(getGame(id)!.status).toBe("lobby");

    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => getGame(id)!.status === "playing");
    expect(getGame(id)!.countdown).toBeUndefined();
    await waitFor(() => sim.current()?.id === yearData(getGame(id)!).round?.trackId);
  });

  it("a cancelled countdown doesn't start", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    install(createSpotifySim({ tracks: catalog(10), playlists: [playlist("pl", 10, true)] }));
    const { id, host, act, loadPlaylist } = setup(1);
    await loadPlaylist("pl");
    await act(host.playerId, { type: "setMode", mode: "year" });
    await act(host.playerId, { type: "countdown" });
    await act(host.playerId, { type: "cancelCountdown" });
    await vi.advanceTimersByTimeAsync(6000);
    expect(getGame(id)!.status).toBe("lobby");
    expect(getGame(id)!.countdown).toBeUndefined();
  });
});

describe("actions that aren't allowed", () => {
  it("change nothing on Spotify: a player can't make the host's device read songs", async () => {
    install(createSpotifySim({ tracks: catalog(70), playlists: [playlist("pl", 70)] }));
    const { id, host, players, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("pl");
    const playerCalls = () => sim.calls.filter(c => c.startsWith("GET /me/player/queue") || c.startsWith("PUT /me/player"));
    const before = playerCalls().length;

    const start = await dispatch(id, players[1].playerId, { type: "start" });
    expect(start).toMatchObject({ ok: false, status: 403 });
    expect(playerCalls()).toHaveLength(before);

    await act(host.playerId, { type: "start" });
    const during = playerCalls().length;
    // Nobody may continue before the round is revealed
    const next = await dispatch(id, players[1].playerId, { type: "next" });
    expect(next.ok).toBe(false);
    expect(playerCalls()).toHaveLength(during);
  });
});

describe("song search", () => {
  it("delivers results page by page until there are no more", async () => {
    install(createSpotifySim({ tracks: catalog(25) }));
    const { id, players } = setup(1);
    const search = async (offset: number) => {
      const req = new Request(`http://test/?q=song&offset=${offset}`, { headers: { [PLAYER_TOKEN_HEADER]: players[1].token } });
      return (await searchRoute.GET(req, ctx(id))).json() as Promise<{ tracks: { id: string }[]; more: boolean }>;
    };
    const first = await search(0);
    expect(first.tracks).toHaveLength(10);
    expect(first.more).toBe(true);
    const last = await search(20);
    expect(last.tracks.map(t => t.id)).toEqual(["t20", "t21", "t22", "t23", "t24"]);
    expect(sim.calls.at(-1)).toContain("offset=20");
    expect((await search(25)).more).toBe(false); // only an empty page is the end
  });
});

describe("picking the playlist", () => {
  it("only works in the lobby, not during a game", async () => {
    install(createSpotifySim({ tracks: catalog(60), playlists: [playlist("a", 30, true), playlist("b", 30, true, 30)] }));
    const { id, host, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("a");
    await act(host.playerId, { type: "start" });
    const res = await loadPlaylist("b");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Die Playlist lässt sich nur in der Lobby wählen");
    expect(getGame(id)!.playlistInfo?.name).toBe("Playlist a");
  });
});

describe("browsing songs by decade and genre", () => {
  it("finds songs of the decade and genre, page by page, and a random one among them", async () => {
    const rock80s = Array.from({ length: 15 }, (_, i) => trackFixture(500 + i, { year: 1983, genres: ["rock"] }));
    const pop80s = Array.from({ length: 5 }, (_, i) => trackFixture(600 + i, { year: 1985, genres: ["pop"] }));
    install(createSpotifySim({ tracks: [...catalog(60), ...rock80s, ...pop80s] }));
    const { id, players } = setup(1);
    const get = async (route: typeof browseRoute | typeof randomRoute, query: string) => {
      const req = new Request(`http://test/?${query}`, { headers: { [PLAYER_TOKEN_HEADER]: players[1].token } });
      return (await route.GET(req, ctx(id))).json();
    };
    const first = await get(browseRoute, "decade=1980&genre=rock");
    expect(first.tracks).toHaveLength(10);
    expect(first.more).toBe(true);
    const rest = await get(browseRoute, "decade=1980&genre=rock&offset=10");
    expect([...first.tracks, ...rest.tracks].map((t: { id: string }) => t.id)).toEqual(rock80s.map(t => t.id));
    expect(sim.calls.at(-1)).toContain(encodeURIComponent('year:1980-1989 genre:"rock"'));

    vi.spyOn(Math, "random").mockReturnValue(0.99); // past the end at first: falls back to the first matches
    const random = await get(randomRoute, "decade=1980&genre=pop");
    expect(pop80s.map(t => t.id)).toContain(random.track.id);
    expect((await get(browseRoute, "genre=unknown")).tracks).toEqual([]); // no filter, no songs
  });
});

describe("browsing by decade alone", () => {
  it("offers more songs although Spotify returns only 5 per page for a search by year alone", async () => {
    const eighties = Array.from({ length: 12 }, (_, i) => trackFixture(500 + i, { year: 1984 }));
    install(createSpotifySim({ tracks: [...catalog(20), ...eighties], yearOnlySearchPage: 5 }));
    const { id, players } = setup(1);
    const browse = async (offset: number) => (await browseRoute.GET(
      new Request(`http://test/?decade=1980&offset=${offset}`, { headers: { [PLAYER_TOKEN_HEADER]: players[1].token } }), ctx(id))).json();
    const seen: string[] = [];
    for (let offset = 0, more = true; more;) {
      const page = await browse(offset);
      seen.push(...page.tracks.map((t: { id: string }) => t.id));
      offset += page.tracks.length;
      more = page.more;
    }
    expect(seen).toEqual(eighties.map(t => t.id));
  });
});

describe("finding playlists", () => {
  it("finds playlists page by page", async () => {
    const mixes = Array.from({ length: 13 }, (_, i) => ({ ...playlist(`mix${i}`, 5, false), name: `Rock Mix ${i}` }));
    install(createSpotifySim({ tracks: catalog(5), playlists: mixes }));
    const { id, host } = setup(0);
    const search = async (query: string) => (await playlistSearchRoute.GET(
      new Request(`http://test/?${query}`, { headers: { [PLAYER_TOKEN_HEADER]: host.token } }), ctx(id))).json();
    const first = await search("q=rock");
    expect(first.playlists).toHaveLength(10);
    const rest = await search("q=rock&offset=10");
    expect([...first.playlists, ...rest.playlists].map((p: { id: string }) => p.id)).toEqual(mixes.map(p => p.id));
  });
});

describe("release years", () => {
  /** MusicBrainz knows every song from 1950 and answers after `delayMs` (per title); Spotify only has later (remastered) years. */
  async function withMusicBrainz(delayMs: number | ((title: string) => number) = 0) {
    const spotify = sim.fetch;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.includes("musicbrainz.org")) return spotify(input, init);
      const title = /recording:\(([^)]*)\)/.exec(decodeURIComponent(url))?.[1] ?? "";
      await new Promise(r => setTimeout(r, typeof delayMs === "number" ? delayMs : delayMs(title)));
      const artist = /artist:"([^"]*)"/.exec(decodeURIComponent(url))?.[1] ?? "";
      return Response.json({ recordings: [{ title, score: 100, "first-release-date": "1950-01-01", "artist-credit": [{ name: artist }] }] });
    });
    // MusicBrainz is reachable again (other tests left it failing, with 503 from the simulator)
    await withOriginalYear({ id: "warmup", name: "Warmup", artist: "Warmup", albumArt: null, previewUrl: null });
  }

  it("a song a player picked gets its original year, not the remaster's", async () => {
    install(createSpotifySim({ tracks: catalog(3) }));
    await withMusicBrainz();
    const { id, host, act } = setup(1);
    await act(host.playerId, { type: "start" });
    const picked = { id: "t1", name: "Picked Song - Remastered 2011", artist: "Picker Band", releaseYear: "2011", albumArt: null, previewUrl: null };
    await act(host.playerId, { type: "pickSong", track: picked });
    await waitFor(() => buzzerData(getGame(id)!).round?.track?.releaseYear === "1950");
  });

  it("a round only starts once its song has the original year", async () => {
    install(createSpotifySim({ tracks: catalog(3), playlists: [playlist("pl", 3, true)] }));
    await withMusicBrainz(200);
    const { id, host, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("pl");
    await act(host.playerId, { type: "start" });
    const game = await act(host.playerId, { type: "reveal" }); // right away, before the background lookup could get there
    expect(yearData(game).round?.result?.song.year).toBe(1950);
    expect(yearData(getGame(id)!).round?.result?.song.year).toBe(1950);
  });

  it("the start only waits for the songs it needs: the first one, plus the start cards of a timeline", async () => {
    install(createSpotifySim({ tracks: catalog(30), playlists: [playlist("pl", 30, true)] }));
    await withMusicBrainz(150);
    const { id, host, act, loadPlaylist } = setup(3);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("pl");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const started = Date.now();
    await act(host.playerId, { type: "start" });
    // 4 players: before, it checked 13 songs (≈ 2 s here, up to 5 s with the real MusicBrainz)
    expect(Date.now() - started).toBeLessThan(900);
    // Each start and song change says in the log how long its steps took
    const line = JSON.parse(info.mock.calls.map(c => String(c[0])).find(l => l.includes('"songChange"'))!);
    expect(line).toMatchObject({ event: "songChange", game: id, action: "start", ms: { songs: expect.any(Number), years: expect.any(Number), play: expect.any(Number) } });

    // Zeitstrahl für alle: the start card is dealt with its original year
    const other = setup(1);
    await other.act(other.host.playerId, { type: "setMode", mode: "together" });
    await other.loadPlaylist("pl");
    await other.act(other.host.playerId, { type: "start" });
    const cards = (getGame(other.id)!.mode as { timeline: { year: number }[] }).timeline;
    expect(cards.map(c => c.year)).toEqual([1950]);
  });

  it("a song whose year arrives after the start reordered the playlist doesn't take the round's song's place", async () => {
    install(createSpotifySim({ tracks: catalog(40), playlists: [playlist("pl", 40, true)] }));
    vi.spyOn(Math, "random").mockReturnValue(0); // a known order: "Song 1" first
    await withMusicBrainz(title => (title === "Song 1" ? 150 : 0));
    // Known from earlier games: every year but the first song's (with the real MusicBrainz: the playlist played before)
    for (const t of catalog(40).filter(t => t.id !== "t1")) {
      await withOriginalYear({ id: t.id, name: t.name, artist: t.artist, albumArt: null, previewUrl: null });
    }
    const { id, host, players, act, loadPlaylist } = setup(1, "host@example.de");
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("pl");
    // The background lookup waits for the first song's year. Earlier games played the first half, so the start moves
    // that song to the end and the round starts with a song whose year is known
    const list = getPlaylist(id)!;
    expect(list[0].id).toBe("t1");
    markPlayed(hostKey("host@example.de"), list.slice(0, 20).map(t => t.id), Date.now() - 1000);
    await act(host.playerId, { type: "start" });
    await waitFor(() => getPlaylist(id)!.every(t => t.yearVerified));

    expect(new Set(getPlaylist(id)!.map(t => t.id)).size).toBe(40);
    await act(host.playerId, { type: "guess", year: 1950 });
    const game = await act(players[1].playerId, { type: "guess", year: 1950 }); // the last guess reveals
    expect(yearData(game).round?.state).toBe("revealed");
  });
});

describe("playback devices", () => {
  it("wakes a dormant device and plays there", async () => {
    install(createSpotifySim({
      tracks: catalog(10), playlists: [playlist("pl", 10, true)],
      devices: [{ id: "phone", name: "Handy", type: "Smartphone" }, { id: "sonos", name: "Wohnzimmer", type: "Speaker", dormant: true }],
    }));
    const { id, host, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("pl");
    setDevice(id, { id: "sonos", name: "Wohnzimmer", type: "Speaker" });

    const r = await dispatch(id, host.playerId, { type: "start" });
    expect(r.ok && r.spotifyError).toBeUndefined();
    expect(sim.player.deviceId).toBe("sonos");
    expect(sim.player.isPlaying).toBe(true);
    expect(sim.current()?.id).toBe(yearData(getGame(id)!).round?.trackId);
  });
});

async function waitFor(check: () => boolean, ms = 3000) {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("Timeout");
    await new Promise(r => setTimeout(r, 20));
  }
}

describe("a long evening: Spotify access expires after an hour", () => {
  const HOUR = 3600_000;
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); });
  afterEach(() => { vi.useRealTimers(); });

  /** A running game with a playlist (Jahr schätzen); `next` plays the next round. */
  async function longGame() {
    install(createSpotifySim({ tracks: catalog(60), playlists: [playlist("pl", 60, true)], tokenLifetimeMs: HOUR }));
    const game = setup(1);
    const { id, host, act, loadPlaylist } = game;
    await act(host.playerId, { type: "setMode", mode: "year" });
    await act(host.playerId, { type: "updateSettings", patch: { maxRounds: 20 } });
    await loadPlaylist("pl");
    await act(host.playerId, { type: "start" });
    const next = async () => {
      await act(host.playerId, { type: "reveal" });
      const r = await dispatch(id, host.playerId, { type: "next" });
      if (!r.ok) throw new Error(r.error);
      return r;
    };
    return { ...game, next };
  }

  it("gets a new access token in time and keeps playing", async () => {
    const { id, next } = await longGame();
    vi.setSystemTime(Date.now() + HOUR - 30_000); // shortly before it expires
    const r = await next();
    expect(r.ok && r.spotifyError).toBeUndefined();
    expect(sim.refreshes).toEqual(["refresh"]);
    expect(sim.current()?.id).toBe(yearData(getGame(id)!).round?.trackId);

    // An hour later again: with the refresh token Spotify handed out the last time
    vi.setSystemTime(Date.now() + HOUR);
    expect((await next()).ok && sim.refreshes).toEqual(["refresh", "refresh-1"]);
    expect(sim.current()?.id).toBe(yearData(getGame(id)!).round?.trackId);
  });

  it("refreshes only once when several requests need it at the same time", async () => {
    const { id, host } = await longGame();
    vi.setSystemTime(Date.now() + HOUR);
    await Promise.all([
      dispatch(id, host.playerId, { type: "pause" }),
      dispatch(id, host.playerId, { type: "play" }),
      musicStatus(id, host.token),
    ]);
    expect(sim.refreshes).toEqual(["refresh"]);
  });

  it("tells the players when Spotify access is gone, the game itself goes on", async () => {
    const { next } = await longGame();
    sim.revokeAccess();
    vi.setSystemTime(Date.now() + HOUR);
    const r = await next();
    expect(r.ok && r.spotifyError).toBe("Host ist nicht mit Spotify verbunden");
  });
});

/** Any host request that needs Spotify (here: the playlist search). */
const musicStatus = (id: string, token: string) =>
  playlistSearchRoute.GET(new Request("http://test/?q=x", { headers: { [PLAYER_TOKEN_HEADER]: token } }), ctx(id));

describe("saving the songs of the evening as a playlist", () => {
  it("the host saves every song of the lobby's games into one private playlist, later games are added to it", async () => {
    install(createSpotifySim({ tracks: catalog(30), playlists: [playlist("pl", 30, true)] }));
    const { id, players, act, loadPlaylist } = setup(1);
    const [host, guest] = players;
    await act(host.playerId, { type: "setMode", mode: "year" });
    await act(host.playerId, { type: "updateSettings", patch: { maxRounds: 2 } });
    await loadPlaylist("pl");
    const save = (token: string) => savePlaylistRoute.POST(post({}, token), ctx(id));
    const playGame = async () => {
      await act(host.playerId, { type: "start" });
      for (let round = 0; round < 2; round++) {
        await act(host.playerId, { type: "reveal" });
        await act(host.playerId, { type: "next" });
      }
      const played = getGame(id)!.history!.map(r => r.song.trackId);
      await act(host.playerId, { type: "reset" }); // back in the lobby
      return played;
    };
    expect((await save(host.token)).status).toBe(400); // nothing played yet

    const first = await playGame();
    expect(first).toHaveLength(2);
    expect((await save(guest.token)).status).toBe(403);
    const res = await save(host.token);
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(getGame(id)!.savedPlaylist).toEqual({ url, songs: 2 });
    const created = () => [...sim.playlists.values()].filter(p => p.id !== "pl");
    expect(created()).toHaveLength(1);
    expect(created()[0].name).toMatch(/^Kennste\?! – /);
    expect(created()[0].trackIds).toEqual(first);
    await save(host.token); // twice: nothing new
    expect(created()[0].trackIds).toEqual(first);

    const second = await playGame();
    expect((await (await save(host.token)).json()).url).toBe(url);
    expect(created()).toHaveLength(1); // the same playlist
    // Each song once, even if the playlist started over and a song came again
    const all = [...new Set([...first, ...second])];
    expect(created()[0].trackIds).toEqual(all);
    expect(getGame(id)!.savedPlaylist).toEqual({ url, songs: all.length });
  });
});

describe("closing the lobby", () => {
  const close = async (id: string, token: string) =>
    (await gameRoute.DELETE(new Request("http://test/", { method: "DELETE", headers: { [PLAYER_TOKEN_HEADER]: token } }), ctx(id))).json();

  it("after a game, everyone gets the evening's summary: the music stops, nobody joins anymore, the host can still save", async () => {
    install(createSpotifySim({ tracks: catalog(30), playlists: [playlist("pl", 30, true)] }));
    const host = createGame("Host", auth(), "host@example.com");
    const guest = joinGame(host.game.id, "Lea")!;
    const id = host.game.id;
    const act = async (action: Action) => { const r = await dispatch(id, host.playerId, action); if (!r.ok) throw new Error(r.error); };
    await act({ type: "setMode", mode: "year" });
    await (await playlistRoute.POST(post({ playlistId: "pl" }, host.token), ctx(id))).json();
    await act({ type: "start" });
    await act({ type: "reveal" });
    expect(sim.player.isPlaying).toBe(true);

    expect((await close(id, guest.token)).error).toBeTruthy(); // only the host
    expect(await close(id, host.token)).toEqual({ ok: true, closed: true });
    const game = getGame(id)!;
    expect(game.closedAt).toBeDefined();
    expect(game.evening?.games).toHaveLength(1);
    expect(sim.player.isPlaying).toBe(false);
    expect(getHostSession("host@example.com")).toBeUndefined(); // free for a new game

    const join = await joinRoute.POST(post({ name: "Tom" }, ""), ctx(id));
    expect(join.status).toBe(403);
    const saved = await savePlaylistRoute.POST(post({}, host.token), ctx(id));
    expect(saved.status).toBe(200);
    expect(getGame(id)!.savedPlaylist?.songs).toBe(1);
  });

  it("without any game played, the lobby is simply gone", async () => {
    install(createSpotifySim({ tracks: catalog(5) }));
    const { id, host } = setup(1);
    expect(await close(id, host.token)).toEqual({ ok: true, closed: false });
    expect(getGame(id)).toBeUndefined();
  });
});

