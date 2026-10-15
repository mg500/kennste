import { afterEach, describe, expect, it, vi } from "vitest";
import { createGame } from "./store";
import { PLAYER_TOKEN_HEADER, type Action } from "./types";
import * as actionRoute from "@/app/api/game/[id]/action/route";
import * as devicesRoute from "@/app/api/game/[id]/devices/route";
import * as joinRoute from "@/app/api/game/[id]/join/route";
import * as playlistRoute from "@/app/api/game/[id]/playlist/route";
import * as gameRoute from "@/app/api/game/[id]/route";

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
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const TOTAL = 50;
  const song = (i: number) => ({ id: `s${i}`, name: `Song ${i}`, artists: [{ name: "A" }], album: { release_date: `${1960 + i}-01-01` } });
  /** Fakes Spotify for a playlist that can only be read through the queue; records the queue positions played. */
  function fakeSpotify() {
    const positions: number[] = [];
    let current: string | undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.includes("api.spotify.com")) return new Response(null, { status: 503 });
      const path = url.replace("https://api.spotify.com/v1", "");
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (path === "/playlists/pl") return Response.json({ id: "pl", name: "Fremde Hits", images: [], items: { total: TOTAL } });
      if (path.startsWith("/playlists/pl/items")) return Response.json({});
      if (path.startsWith("/me/player/play") && body.context_uri === "spotify:playlist:pl") positions.push(body.offset.position);
      if (path.startsWith("/me/player/play") && body.uris) current = body.uris[0].replace("spotify:track:", "");
      if (path === "/me/player/queue") {
        const at = positions.at(-1)!;
        // Past the end the queue goes on with other music
        return Response.json({ currently_playing: song(at), queue: Array.from({ length: 20 }, (_, k) => song(at + 1 + k)) });
      }
      if (path === "/me/player" && !init?.method) return Response.json({ is_playing: !!current, item: current ? { id: current, name: "Song" } : null });
      return new Response(null, { status: 204 });
    }));
    return positions;
  }
  const load = (id: string, token: string) => playlistRoute.POST(post({ playlistId: "pl" }, token), ctx(id));

  it("reads a block through the queue and more when the game starts", async () => {
    const { id, host, act } = await setup();
    const positions = fakeSpotify();
    vi.spyOn(Math, "random").mockReturnValue(0.99); // last block first
    await act({ type: "setMode", mode: "year" }, host.token);

    const game = await (await load(id, host.token)).json();
    expect(positions).toEqual([42]);
    expect(game.playlistTrackCount).toBe(8); // only songs of the playlist, not what follows its end
    expect(game.playlistInfo).toEqual({ name: "Fremde Hits", image: null });

    const { game: started } = await (await act({ type: "start" }, host.token)).json();
    expect(positions).toEqual([42, 0, 21]);
    expect(started.playlistTrackCount).toBe(TOTAL);
    expect(started.playlistLoading).toBeUndefined();
  });
});
