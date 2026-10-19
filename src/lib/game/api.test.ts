import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpotifySim, trackFixture } from "@/test/spotifySim";
import { timing } from "../spotify";
import { createGame, getGame, setPlaylist } from "./store";
import { PLAYER_TOKEN_HEADER, type Action } from "./types";
import * as actionRoute from "@/app/api/game/[id]/action/route";
import * as answerRoute from "@/app/api/game/[id]/answer/route";
import * as devicesRoute from "@/app/api/game/[id]/devices/route";
import * as joinRoute from "@/app/api/game/[id]/join/route";
import * as playlistRoute from "@/app/api/game/[id]/playlist/route";
import * as gameRoute from "@/app/api/game/[id]/route";
import * as healthRoute from "@/app/api/health/route";
import pkg from "../../../package.json";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

function post(body: unknown, token?: string) {
  return new Request("http://test/", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { [PLAYER_TOKEN_HEADER]: token } : {}) },
    body: JSON.stringify(body),
  });
}

async function setup() {
  const host = createGame("Host", { accessToken: "SECRET_ACCESS", refreshToken: "SECRET_REFRESH", expiresAt: Date.now() + 3600_000 }, null);
  const id = host.game.id;
  const res = await joinRoute.POST(post({ name: "Alice" }), ctx(id));
  const alice = await res.json();
  const act = (action: Action, token?: string) => actionRoute.POST(post(action, token), ctx(id));
  return { id, host, alice, act };
}

describe("game API", () => {
  it("never exposes Spotify credentials or player tokens", async () => {
    const { id, alice } = await setup();
    const joinBody = JSON.stringify(alice.game);
    const getBody = await (await gameRoute.GET(new Request("http://test/"), ctx(id))).text();
    for (const body of [joinBody, getBody]) {
      expect(body).not.toContain("SECRET");
      expect(body).not.toContain(alice.token);
    }
  });

  it("rejects actions without a valid token", async () => {
    const { act } = await setup();
    expect((await act({ type: "start" })).status).toBe(401);
    expect((await act({ type: "start" }, "forged")).status).toBe(401);
  });

  it("rejects host actions from regular players", async () => {
    const { act, alice, host } = await setup();
    expect((await act({ type: "kick", playerId: host.playerId }, alice.token)).status).toBe(403);
    expect((await act({ type: "start" }, alice.token)).status).toBe(403);
  });

  it("rejects malformed actions", async () => {
    const { act, host } = await setup();
    expect((await act({ type: "nope" } as never, host.token)).status).toBe(400);
  });

  it("revokes access for kicked players", async () => {
    const { act, alice, host } = await setup();
    expect((await act({ type: "kick", playerId: alice.playerId }, host.token)).status).toBe(200);
    expect((await act({ type: "skip" }, alice.token)).status).toBe(401);
  });

  it("only the host can delete the game", async () => {
    const { id, alice, host } = await setup();
    const del = (token: string) => gameRoute.DELETE(new Request("http://test/", { method: "DELETE", headers: { [PLAYER_TOKEN_HEADER]: token } }), ctx(id));
    expect((await del(alice.token)).status).toBe(403);
    expect((await del(host.token)).status).toBe(200);
    expect((await gameRoute.GET(new Request("http://test/"), ctx(id))).status).toBe(404);
  });
});

describe("health check", () => {
  it("answers without login and is never cached", async () => {
    const res = healthRoute.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", version: pkg.version });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("playback device", () => {
  afterEach(() => vi.unstubAllGlobals());

  const devices = [
    { id: "sonos", name: "Wohnzimmer", type: "Speaker", is_active: false, is_restricted: false },
    { id: "tv", name: "TV", type: "TV", is_active: false, is_restricted: true },
  ];
  /** Fakes the Spotify API and records every request as "METHOD path". */
  function fakeSpotify() {
    const calls: string[] = [];
    let playing: string | undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace("https://api.spotify.com/v1", "");
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/me/player/devices") return Response.json({ devices });
      // The picked device plays the last requested track right away
      const uri = init?.body && JSON.parse(String(init.body)).uris?.[0];
      if (uri) playing = uri.replace("spotify:track:", "");
      if (path === "/me/player" && !init?.method && playing) {
        return Response.json({ is_playing: true, item: { id: playing, name: "Song" }, device: { id: "sonos", name: "Wohnzimmer", type: "Speaker" } });
      }
      return new Response(null, { status: 204 });
    }));
    return calls;
  }
  const select = (id: string, deviceId: string | null, token: string) => devicesRoute.POST(post({ deviceId }, token), ctx(id));

  it("is only available to the host", async () => {
    const { id, alice } = await setup();
    fakeSpotify();
    expect((await devicesRoute.GET(new Request("http://test/", { headers: { [PLAYER_TOKEN_HEADER]: alice.token } }), ctx(id))).status).toBe(403);
    expect((await select(id, "sonos", alice.token)).status).toBe(403);
  });

  it("moves playback to the picked device and plays every song there", async () => {
    const { id, host, act } = await setup();
    const calls = fakeSpotify();
    const res = await select(id, "sonos", host.token);
    expect(res.status).toBe(200);
    expect((await res.json()).device).toEqual({ id: "sonos", name: "Wohnzimmer", type: "Speaker" });
    expect(calls).toContain("PUT /me/player");

    await act({ type: "start" }, host.token);
    await act({ type: "pickSong", track: { id: "t1", name: "Song", artist: "A", albumArt: null, previewUrl: null } }, host.token);
    expect(calls).toContain("PUT /me/player/play?device_id=sonos");
  });

  it("rejects restricted or unknown devices and can go back to automatic", async () => {
    const { id, host } = await setup();
    fakeSpotify();
    expect((await select(id, "tv", host.token)).status).toBe(400);
    expect((await select(id, "gone", host.token)).status).toBe(404);
    await select(id, "sonos", host.token);
    expect((await (await select(id, null, host.token)).json()).device).toBeUndefined();
  });
});

describe("foreign playlists", () => {
  beforeEach(() => { timing.scale = 0; });
  afterEach(() => { timing.scale = 1; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const TOTAL = 50;
  const load = (id: string, token: string) => playlistRoute.POST(post({ playlistId: "pl" }, token), ctx(id));

  it("reads a block through the queue and more when the game starts", async () => {
    const { id, host, act } = await setup();
    const sim = createSpotifySim({
      tracks: Array.from({ length: TOTAL }, (_, i) => trackFixture(i)),
      playlists: [{ id: "pl", name: "Fremde Hits", owner: "spotify", own: false, trackIds: Array.from({ length: TOTAL }, (_, i) => `t${i}`) }],
    });
    vi.stubGlobal("fetch", sim.fetch);
    vi.spyOn(Math, "random").mockReturnValue(0.99); // last block first
    await act({ type: "setMode", mode: "year" }, host.token);

    const game = await (await load(id, host.token)).json();
    const positions = () => sim.plays.filter(p => p.startsWith("spotify:playlist:pl")).map(p => Number(p.split("@")[1]));
    expect(positions()).toEqual([40]);
    expect(game.playlistTrackCount).toBe(9); // only songs of the playlist, not the autoplay after its end
    expect(game.playlistInfo).toEqual({ name: "Fremde Hits", image: null });

    const { game: started } = await (await act({ type: "start" }, host.token)).json();
    expect(positions()).toEqual([40, 0]);
    expect(started.playlistTrackCount).toBe(30);
    expect(started.playlistLoading).toBeUndefined();
  });
});

describe("continue vote", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const song = (n: number) => ({ id: `t${n}`, name: `Song ${n}`, artist: "A", albumArt: null, previewUrl: null, yearVerified: true });

  /**
   * Buzzer round of the host revealed: Alice continues, the host is the only other player. Songs from a playlist,
   * so the game waits for someone to continue. Without Spotify, so nothing waits for the player (the timers are fake).
   */
  async function revealed(songSource: "playlist" | "players" = "playlist") {
    const host = createGame("Host", undefined, null);
    const id = host.game.id;
    const alice = await (await joinRoute.POST(post({ name: "Alice" }), ctx(id))).json();
    const act = (action: Action, token?: string) => actionRoute.POST(post(action, token), ctx(id));
    await act({ type: "updateSettings", patch: { songSource } }, host.token);
    if (songSource === "playlist") setPlaylist(id, { id: "pl", name: "Playlist", image: null }, [1, 2, 3, 4].map(song));
    await act({ type: "start" }, host.token);
    if (songSource === "players") await act({ type: "pickSong", track: song(1) }, host.token);
    await act({ type: "reveal" }, host.token);
    return { id, host, alice, act };
  }
  const state = (id: string) => getGame(id)?.mode.round?.state;

  it("the server continues for the next player when the countdown ends", async () => {
    const { id, host, alice, act } = await revealed();
    expect((await act({ type: "voteContinue", want: true }, alice.token)).status).toBe(400); // Alice continues herself
    expect((await act({ type: "voteContinue", want: true }, host.token)).status).toBe(200);
    expect(getGame(id)?.continueVote?.countdownAt).toBeDefined();

    await vi.advanceTimersByTimeAsync(4900);
    expect(state(id)).toBe("revealed");
    await vi.advanceTimersByTimeAsync(200);
    expect(state(id)).toBe("playing"); // the next playlist song
    expect(getGame(id)?.players[getGame(id)!.currentPlayerIndex].id).toBe(alice.playerId);
    expect(getGame(id)?.continueVote).toBeUndefined();
  });

  it("when players pick songs, the next one gets to search after a few seconds without anybody voting", async () => {
    const { id, alice } = await revealed("players");
    await vi.advanceTimersByTimeAsync(9000); // 10 s to look at the song
    expect(state(id)).toBe("revealed");
    await vi.advanceTimersByTimeAsync(1600);
    expect(state(id)).toBe("picking");
    expect(getGame(id)?.players[getGame(id)!.currentPlayerIndex].id).toBe(alice.playerId);
  });

  it("stops when the vote is withdrawn", async () => {
    const { id, host, act } = await revealed();
    await act({ type: "voteContinue", want: true }, host.token);
    await vi.advanceTimersByTimeAsync(3000);
    await act({ type: "voteContinue", want: false }, host.token);
    await vi.advanceTimersByTimeAsync(5000);
    expect(state(id)).toBe("revealed");
  });
});

describe("Alle gegen alle: the answer", () => {
  it("only the player who buzzed gets the song, and only after answering; everyone else is refused", async () => {
    const host = createGame("Host", undefined, null);
    const id = host.game.id;
    const alice = await (await joinRoute.POST(post({ name: "Alice" }), ctx(id))).json();
    const act = (action: Action, token: string) => actionRoute.POST(post(action, token), ctx(id));
    await act({ type: "setMode", mode: "versus" }, host.token);
    setPlaylist(id, { id: "pl", name: "Playlist", image: null }, [1, 2].map(n => ({ id: `t${n}`, name: `Song ${n}`, artist: "A", albumArt: null, previewUrl: null, yearVerified: true })));
    await act({ type: "start" }, host.token);
    const answer = (token: string) => answerRoute.GET(new Request("http://test/", { headers: { [PLAYER_TOKEN_HEADER]: token } }), ctx(id));

    expect((await answer(alice.token)).status).toBe(403); // nobody buzzed yet
    await act({ type: "buzz" }, alice.token);
    expect((await answer(alice.token)).status).toBe(403); // still answering – no peeking
    await act({ type: "answered" }, alice.token);
    const res = await answer(alice.token);
    expect(res.status).toBe(200);
    expect((await res.json()).song.name).toMatch(/^Song [12]$/);
    expect((await answer(host.token)).status).toBe(403);
    expect(JSON.stringify(getGame(id))).not.toMatch(/Song [12]/);
  });
});
