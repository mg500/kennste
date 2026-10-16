import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGame } from "@/lib/game/store";
import { PAIRING_TTL_MS, resetPairings } from "@/lib/game/pairing";
import { PLAYER_TOKEN_HEADER } from "@/lib/game/types";
import * as joinRoute from "@/app/api/game/[id]/join/route";
import * as screenRoute from "@/app/api/game/[id]/screen/route";
import * as tvRoute from "./route";
import * as statusRoute from "./[screenId]/route";
import * as pairRoute from "./pair/route";

// Who is logged in with Spotify (the host after scanning the QR code)
const session = vi.hoisted(() => ({ current: null as { user: { email: string } } | null }));
vi.mock("next-auth", () => ({ getServerSession: async () => session.current }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const ctx = <T extends object>(params: T) => ({ params: Promise.resolve(params) }) as never;
const post = (body: unknown, token?: string) => new Request("http://test/", {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(token ? { [PLAYER_TOKEN_HEADER]: token } : {}) },
  body: JSON.stringify(body),
});

/** A TV opens /tv and gets its code. */
async function tv() {
  const { screenId, code } = await (tvRoute.POST()).json();
  const poll = async () => {
    const res = await statusRoute.GET(new Request("http://test/"), ctx({ screenId }));
    return { status: res.status, body: await res.json() };
  };
  return { code: code as string, poll };
}

async function game(userId: string | null = null) {
  const host = createGame("Max", undefined, userId);
  const lea = await (await joinRoute.POST(post({ name: "Lea" }), ctx({ id: host.game.id }))).json();
  const pair = (code: string, token: string) => screenRoute.POST(post({ code }, token), ctx({ id: host.game.id }));
  return { id: host.game.id, host, lea, pair };
}

beforeEach(() => { resetPairings(); vi.useFakeTimers({ toFake: ["Date"] }); });
afterEach(() => { vi.useRealTimers(); session.current = null; });

describe("TV pairing", () => {
  it("the host enters the code the TV shows, and the TV learns which game to show", async () => {
    const screen = await tv();
    const { id, host, pair } = await game();
    expect(screen.code).toMatch(/^\d{4}$/);
    expect(await screen.poll()).toEqual({ status: 200, body: { status: "waiting", code: screen.code, expiresInMs: PAIRING_TTL_MS } });

    expect((await pair(screen.code, host.token)).status).toBe(200);
    expect(await screen.poll()).toEqual({ status: 200, body: { status: "paired", gameId: id } });
    // Used up: neither the TV nor anyone else can use it again
    expect((await screen.poll()).status).toBe(404);
    expect((await pair(screen.code, host.token)).status).toBe(409);
  });

  it("only the host can connect a TV, and not by trying every code", async () => {
    const screen = await tv();
    const { host, lea, pair } = await game();
    expect((await pair(screen.code, lea.token)).status).toBe(403);
    expect((await pair("12", host.token)).status).toBe(400);

    const wrong = screen.code === "0000" ? "0001" : "0000";
    for (let i = 0; i < 10; i++) expect((await pair(wrong, host.token)).status).toBe(409);
    const blocked = await pair(screen.code, host.token);
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error).toMatch(/Zu viele Versuche/);

    vi.setSystemTime(Date.now() + 60_000);
    expect((await pair(screen.code, host.token)).status).toBe(200);
  });

  it("a code runs out after 10 minutes, then the TV asks for a new one", async () => {
    const screen = await tv();
    const { host, pair } = await game();
    vi.setSystemTime(Date.now() + PAIRING_TTL_MS);
    expect((await screen.poll()).status).toBe(404);
    expect((await pair(screen.code, host.token)).status).toBe(409);
  });

  it("after scanning the QR code, the host is recognized by their Spotify login", async () => {
    const screen = await tv();
    const { id } = await game("max@example.de");
    const preview = () => pairRoute.GET(new Request(`http://test/api/tv/pair?code=${screen.code}`));

    expect((await preview()).status).toBe(404); // not logged in: no game to connect
    session.current = { user: { email: "max@example.de" } };
    expect(await (await preview()).json()).toEqual({ gameId: id, mode: "Buzzer-Quiz", players: 2 });

    expect((await pairRoute.POST(post({ code: screen.code }))).status).toBe(200);
    expect((await screen.poll()).body).toEqual({ status: "paired", gameId: id });
  });
});
