import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as musicRoute from "@/app/api/game/[id]/music/route";
import * as playlistRoute from "@/app/api/game/[id]/playlist/route";
import { createSpotifySim, trackFixture, type SimPlaylist, type SpotifySim } from "@/test/spotifySim";
import { timing } from "../spotify";
import { buzzerData } from "./modes/buzzer";
import { createGame, dispatch, getGame, joinGame, refreshPlayback, setDevice, subscribe } from "./store";
import { PLAYER_TOKEN_HEADER, type Action, type GameEvent, type Playback } from "./types";

// Whole flows against the Spotify simulator: what the unit tests can't see (several requests in a row,
// Spotify's player state before and after).

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const post = (body: unknown, token: string) => new Request("http://test/", {
  method: "POST", headers: { "Content-Type": "application/json", [PLAYER_TOKEN_HEADER]: token }, body: JSON.stringify(body),
});
const auth = { accessToken: "token", refreshToken: "refresh", expiresAt: Date.now() + 3600_000 };

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
  const host = createGame("Host", auth, null);
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
  it("loads more songs in time, never repeats one and ends when all were played", async () => {
    install(createSpotifySim({ tracks: catalog(70), playlists: [playlist("pl", 70)], lag: 2 }));
    sim.player.shuffle = true; // the host listens in shuffle mode
    vi.spyOn(Math, "random").mockReturnValue(0); // the first block first
    const { id, players, act, loadPlaylist } = setup(3);
    const [host] = players;
    await act(host.playerId, { type: "updateSettings", patch: { songSource: "playlist", maxRounds: 20 } });

    const loaded = await loadPlaylist("pl");
    expect(loaded.status).toBe(200);
    expect(loaded.body.playlistTrackCount).toBe(21);

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
    expect(played).toHaveLength(70);
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
    const expected = sim.playlists.get("pl")!.trackIds.slice(start, start + 21);
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
