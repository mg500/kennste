// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPlayer, newGame } from "./reducer";
import type { GameEvent } from "./types";
import { useGameSession } from "./useGameSession";

/** Stand-in for the browser's EventSource that the test drives by hand. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readyState = FakeEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeEventSource.instances.push(this); }
  close() { this.readyState = FakeEventSource.CLOSED; }
  emit(event: GameEvent) { act(() => this.onmessage?.({ data: JSON.stringify(event) })); }
  /** What mobile browsers do in the background: the stream is gone for good. */
  drop() { this.readyState = FakeEventSource.CLOSED; act(() => this.onerror?.()); }
}
const latest = () => FakeEventSource.instances.at(-1)!;

let gameStatus = 200;
beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.instances = [];
  gameStatus = 200;
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: gameStatus })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const game = addPlayer(newGame("g1", 0), { id: "h", name: "H", joinedAt: 0 })!;

describe("useGameSession", () => {
  it("reconnects when the stream drops while the game still exists", async () => {
    const { result } = renderHook(() => useGameSession("g1", null));
    latest().emit({ type: "game", game });
    expect(result.current.game?.id).toBe("g1");

    latest().drop();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(result.current.notFound).toBe(false);
    expect(result.current.game?.id).toBe("g1");
  });

  it("tells the server who is watching, so the stream carries this player's view – once the token is known", () => {
    const { rerender } = renderHook(({ token }) => useGameSession("g1", token ? { playerId: "a", token } : null), {
      initialProps: { token: "" },
    });
    expect(latest().url).toBe("/api/game/g1/events");
    // The saved token is restored after the first render: reconnect with it
    rerender({ token: "secret" });
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
    expect(latest().url).toBe("/api/game/g1/events?token=secret");
  });

  it("only reports the game as over when the server says so", async () => {
    const { result } = renderHook(() => useGameSession("g1", null));
    gameStatus = 404;
    latest().drop();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.notFound).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("reconnects when the tab becomes visible again", async () => {
    renderHook(() => useGameSession("g1", null));
    latest().close(); // closed in the background without an error event
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it("keeps retrying with growing pauses while the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const { result } = renderHook(() => useGameSession("g1", null));
    latest().drop();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(FakeEventSource.instances).toHaveLength(2);
    latest().drop();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(FakeEventSource.instances).toHaveLength(2); // now waits 2 s
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(FakeEventSource.instances).toHaveLength(3);
    expect(result.current.notFound).toBe(false);
  });
});
