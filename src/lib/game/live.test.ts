import { describe, expect, it } from "vitest";
import { createGame, deleteGame, dispatch, joinGame, subscribe } from "./store";
import type { GameEvent } from "./types";
import * as eventsRoute from "@/app/api/game/[id]/events/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

function newGame() {
  // No Spotify credentials → playback polling is a no-op
  return createGame("Host", undefined, null);
}

describe("live updates", () => {
  it("sends the current state on subscribe and every change afterwards", async () => {
    const host = newGame();
    const events: GameEvent[] = [];
    const unsubscribe = subscribe(host.game.id, e => events.push(e))!;

    expect(events).toEqual([{ type: "game", game: host.game }]);
    joinGame(host.game.id, "Alice");
    await dispatch(host.game.id, host.playerId, { type: "updateSettings", patch: { maxRounds: 3 } });

    const versions = events.map(e => (e.type === "game" ? e.game.version : -1));
    expect(versions).toEqual([host.game.version, host.game.version + 1, host.game.version + 2]);
    unsubscribe();
    deleteGame(host.game.id);
  });

  it("does not publish rejected actions", async () => {
    const host = newGame();
    const alice = joinGame(host.game.id, "Alice")!;
    const events: GameEvent[] = [];
    subscribe(host.game.id, e => events.push(e));
    await dispatch(host.game.id, alice.playerId, { type: "start" });
    expect(events).toHaveLength(1);
    deleteGame(host.game.id);
  });

  it("counts connected big screens and tells everyone", () => {
    const host = newGame();
    const id = host.game.id;
    const events: GameEvent[] = [];
    subscribe(id, e => events.push(e));
    const closeScreen1 = subscribe(id, () => {}, { screen: true })!;
    const closeScreen2 = subscribe(id, () => {}, { screen: true })!;
    const last = () => events.filter(e => e.type === "game").at(-1);
    expect(last()).toMatchObject({ game: { connectedScreens: 2 } });
    closeScreen1();
    closeScreen1(); // closing twice must not count twice
    expect(last()).toMatchObject({ game: { connectedScreens: 1 } });
    closeScreen2();
    expect(last()).toMatchObject({ game: { connectedScreens: 0 } });
    deleteGame(id);
  });

  it("notifies subscribers when the game is deleted", () => {
    const host = newGame();
    const events: GameEvent[] = [];
    subscribe(host.game.id, e => events.push(e));
    deleteGame(host.game.id);
    expect(events.at(-1)).toEqual({ type: "deleted" });
    expect(subscribe(host.game.id, () => {})).toBeNull();
  });
});

describe("events route", () => {
  it("returns 404 for unknown games", async () => {
    const res = await eventsRoute.GET(new Request("http://test/"), ctx("nope00"));
    expect(res.status).toBe(404);
  });

  it("streams the game as server-sent events and ends when the game is deleted", async () => {
    const host = newGame();
    const res = await eventsRoute.GET(new Request("http://test/"), ctx(host.game.id));
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    const first = await reader.read();
    expect(first.value).toMatch(/^data: /);
    expect(JSON.parse(first.value!.slice(6))).toMatchObject({ type: "game", game: { id: host.game.id } });

    deleteGame(host.game.id);
    const second = await reader.read();
    expect(JSON.parse(second.value!.slice(6))).toEqual({ type: "deleted" });
    expect((await reader.read()).done).toBe(true);
  });
});
