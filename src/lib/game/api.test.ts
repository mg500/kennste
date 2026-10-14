import { afterEach, describe, expect, it, vi } from "vitest";
import { createGame } from "./store";
import { PLAYER_TOKEN_HEADER, type Action } from "./types";
import * as actionRoute from "@/app/api/game/[id]/action/route";
import * as devicesRoute from "@/app/api/game/[id]/devices/route";
import * as joinRoute from "@/app/api/game/[id]/join/route";
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
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace("https://api.spotify.com/v1", "");
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/me/player/devices") return Response.json({ devices });
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
