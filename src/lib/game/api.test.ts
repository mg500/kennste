import { describe, expect, it } from "vitest";
import { createGame } from "./store";
import { PLAYER_TOKEN_HEADER, type Action } from "./types";
import * as actionRoute from "@/app/api/game/[id]/action/route";
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
