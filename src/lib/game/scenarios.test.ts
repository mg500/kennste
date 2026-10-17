import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as musicRoute from "@/app/api/game/[id]/music/route";
import * as searchRoute from "@/app/api/game/[id]/search/route";
import * as browseRoute from "@/app/api/game/[id]/browse/route";
import * as randomRoute from "@/app/api/game/[id]/random/route";
import * as playlistRoute from "@/app/api/game/[id]/playlist/route";
import * as playlistSearchRoute from "@/app/api/game/[id]/playlist-search/route";
import { createSpotifySim, trackFixture, type SimPlaylist, type SpotifySim } from "@/test/spotifySim";
import { withOriginalYear } from "../releaseYear";
import { timing } from "../spotify";
import { buzzerData } from "./modes/buzzer";
import { yearData } from "./modes/year";
import { createGame, dispatch, getGame, joinGame, refreshPlayback, setDevice, subscribe } from "./store";
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

/** A game with the host and `others` more players. */
function setup(others: number) {
  const host = createGame("Host", auth(), null);
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
afterEach(() => { timing.scale = 1; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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
    await act(host.playerId, { type: "updateSettings", patch: { songSource: "playlist", maxRounds: 20 } });

    const loaded = await loadPlaylist("pl");
    expect(loaded.status).toBe(200);
    expect(loaded.body.playlistTrackCount).toBe(21);
    expect(new Set(sim.plays.map(p => p.split("@")[1]))).toEqual(new Set(["0"]));

    let game = await act(host.playerId, { type: "start" });
    expect(game.playlistTrackCount).toBeGreaterThanOrEqual(30); // enough for the start
    const queueReads = () => sim.calls.filter(c => c === "GET /me/player/queue").length;

    const played: string[] = [];
    while (game.status === "playing") {
      const round = buzzerData(game).round!;
      played.push(round.track!.id);
      // Songs are only read while the music changes anyway: never during a round
      const before = queueReads();
      game = await act(game.players[game.currentPlayerIndex].id, { type: "reveal" });
      expect(queueReads()).toBe(before);
      const next = game.players[(game.currentPlayerIndex + 1) % game.players.length];
      game = await act(next.id, { type: "next" });
    }

    expect(new Set(played).size).toBe(played.length);
    expect(played.length).toBeGreaterThanOrEqual(69); // at most one song gets lost at the playlist's start or end
    expect(played.every(t => sim.playlists.get("pl")!.trackIds.includes(t))).toBe(true); // no autoplay songs
    expect(game.outOfSongs).toBe(true);
    expect(getGame(id)?.playlistLoading).toBeUndefined();
  });

  it("reads the queue with shuffle off and puts the host's music back afterwards", async () => {
    install(createSpotifySim({ tracks: catalog(130), playlists: [playlist("pl", 50), playlist("mine", 10, true, 100)], lag: 2 }));
    // The host listens to an album in shuffle mode, 42 s into a song
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
    expect(sim.player.contextUri).toBe("spotify:album:al120");
    expect(sim.current()?.id).toBe("t120");
    expect(sim.player.progressMs).toBe(42_000);
    expect(sim.player.isPlaying).toBe(true);
  });

  it("puts the music back even when two playlists are read right after each other", async () => {
    install(createSpotifySim({ tracks: catalog(130), playlists: [playlist("a", 50), playlist("b", 50, false, 50)], lag: 2 }));
    await sim.fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT", body: JSON.stringify({ context_uri: "spotify:album:al120", offset: { uri: "spotify:track:t120" } }),
    });
    sim.settle();
    const { loadPlaylist } = setup(1);
    await loadPlaylist("a");
    await loadPlaylist("b"); // Spotify still reports a song of playlist "a", paused
    sim.settle();
    expect(sim.current()?.id).toBe("t120");
    expect(sim.player.isPlaying).toBe(true);
  });

  it("loads own playlists completely, also beyond 100 songs, without touching the player", async () => {
    install(createSpotifySim({ tracks: catalog(150), playlists: [playlist("mine", 150, true)] }));
    const { loadPlaylist } = setup(1);
    const { body } = await loadPlaylist("mine");
    expect(body.playlistTrackCount).toBe(150);
    expect(sim.calls.some(c => c.startsWith("PUT /me/player"))).toBe(false);
  });
});

describe("lobby music", () => {
  it("shows title and cover in the lobby only, never during the game", async () => {
    install(createSpotifySim({ tracks: catalog(30), playlists: [playlist("pl", 30, true)] }));
    const { id, host, act, loadPlaylist } = setup(1);
    const events: Playback[] = [];
    subscribe(id, (e: GameEvent) => { if (e.type === "playback") events.push(e.playback); });
    await act(host.playerId, { type: "updateSettings", patch: { songSource: "playlist" } });
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
    expect(last.more).toBe(false);
    expect(sim.calls.at(-1)).toContain("offset=20");
  });
});

describe("changing the playlist during the game", () => {
  it("an own playlist takes over with the next song; the running round keeps its song", async () => {
    install(createSpotifySim({ tracks: catalog(60), playlists: [playlist("a", 30, true), playlist("b", 30, true, 30)] }));
    const { id, host, players, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("a");
    let game = await act(host.playerId, { type: "start" });
    const first = yearData(game).round!.trackId;

    const res = await loadPlaylist("b");
    expect(res.status).toBe(200);
    expect(res.body.pendingPlaylist).toEqual({ name: "Playlist b", image: null });
    expect(yearData(getGame(id)!).round?.trackId).toBe(first); // nothing changes yet
    expect(sim.current()?.id).toBe(first);

    await act(players[1].playerId, { type: "guess", year: 1990 });
    game = await act(host.playerId, { type: "guess", year: 1990 }); // revealed with the song of playlist a
    expect(yearData(game).round?.result?.song.name).toBe(`Song ${first.slice(1)}`);
    game = await act(host.playerId, { type: "next" });
    expect(Number(yearData(game).round!.trackId.slice(1))).toBeGreaterThanOrEqual(30); // from playlist b
    expect(game.playlistInfo?.name).toBe("Playlist b");
    expect(game.pendingPlaylist).toBeUndefined();
  });

  it("a foreign playlist is only read when the next song starts, not in the middle of a round", async () => {
    install(createSpotifySim({ tracks: catalog(80), playlists: [playlist("a", 30, true), playlist("f", 40, false, 40)] }));
    const { host, players, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "setMode", mode: "year" });
    await loadPlaylist("a");
    await act(host.playerId, { type: "start" });
    const queueReads = () => sim.calls.filter(c => c === "GET /me/player/queue").length;
    const before = queueReads();

    expect((await loadPlaylist("f")).status).toBe(200);
    expect(queueReads()).toBe(before); // the music of the running round goes on

    await act(players[1].playerId, { type: "guess", year: 1990 });
    await act(host.playerId, { type: "guess", year: 1990 });
    const game = await act(host.playerId, { type: "next" });
    expect(queueReads()).toBeGreaterThan(before);
    expect(Number(yearData(game).round!.trackId.slice(1))).toBeGreaterThanOrEqual(40);
    expect(sim.current()?.id).toBe(yearData(game).round!.trackId);
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

describe("release years", () => {
  /** MusicBrainz knows every song from 1950 and answers after `delayMs`; Spotify only has later (remastered) years. */
  async function withMusicBrainz(delayMs = 0) {
    const spotify = sim.fetch;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.includes("musicbrainz.org")) return spotify(input, init);
      await new Promise(r => setTimeout(r, delayMs));
      const title = /recording:"([^"]*)"/.exec(decodeURIComponent(url))?.[1] ?? "";
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
});

describe("playback devices", () => {
  it("wakes a dormant device and plays there", async () => {
    install(createSpotifySim({
      tracks: catalog(10), playlists: [playlist("pl", 10, true)],
      devices: [{ id: "phone", name: "Handy", type: "Smartphone" }, { id: "sonos", name: "Wohnzimmer", type: "Speaker", dormant: true }],
    }));
    const { id, host, act, loadPlaylist } = setup(1);
    await act(host.playerId, { type: "updateSettings", patch: { songSource: "playlist" } });
    await loadPlaylist("pl");
    setDevice(id, { id: "sonos", name: "Wohnzimmer", type: "Speaker" });

    const r = await dispatch(id, host.playerId, { type: "start" });
    expect(r.ok && r.spotifyError).toBeUndefined();
    expect(sim.player.deviceId).toBe("sonos");
    expect(sim.player.isPlaying).toBe(true);
    expect(sim.current()?.id).toBe(buzzerData(getGame(id)!).round?.track?.id);
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

  /** A running buzzer game with a playlist; `next` plays the next round. */
  async function longGame() {
    install(createSpotifySim({ tracks: catalog(60), playlists: [playlist("pl", 60, true)], tokenLifetimeMs: HOUR }));
    const game = setup(1);
    const { id, host, act, loadPlaylist } = game;
    await act(host.playerId, { type: "updateSettings", patch: { songSource: "playlist", maxRounds: 20 } });
    await loadPlaylist("pl");
    await act(host.playerId, { type: "start" });
    const next = async () => {
      let g = getGame(id)!;
      g = await act(g.players[g.currentPlayerIndex].id, { type: "reveal" });
      const r = await dispatch(id, g.players[(g.currentPlayerIndex + 1) % g.players.length].id, { type: "next" });
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
    expect(sim.current()?.id).toBe(buzzerData(getGame(id)!).round?.track?.id);

    // An hour later again: with the refresh token Spotify handed out the last time
    vi.setSystemTime(Date.now() + HOUR);
    expect((await next()).ok && sim.refreshes).toEqual(["refresh", "refresh-1"]);
    expect(sim.current()?.id).toBe(buzzerData(getGame(id)!).round?.track?.id);
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
