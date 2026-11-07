// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountdown } from "@/components/ui/useCountdown";
import { resetClock } from "./clock";
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
  emit(event: GameEvent, now?: number) { act(() => this.onmessage?.({ data: JSON.stringify({ ...event, now }) })); }
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
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); resetClock(); });

const game = addPlayer(newGame("g1", 0), { id: "h", name: "H", joinedAt: 0 })!;

describe("useGameSession", () => {
  it("counts down by the server's clock: a device whose clock is 4 s behind shows the same time as the others", () => {
    vi.setSystemTime(100_000); // this device
    const server = 104_000;
    const { result } = renderHook(() => {
      const session = useGameSession("g1", null);
      return { session, left: useCountdown(5, session.game ? server : undefined, true) };
    });
    // The round started on the server just now; the event took 300 ms to arrive
    vi.setSystemTime(100_300);
    latest().emit({ type: "game", game }, server);
    expect(result.current.left?.seconds).toBe(5);
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(result.current.left?.seconds).toBe(3);
  });

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

  it("sends a player's actions one after the other: a slow draft can't arrive after „Fertig“ and undo it", async () => {
    const arrived: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.endsWith("/action")) return new Response(null, { status: 200 });
      const action = JSON.parse(String(init!.body));
      await new Promise(r => setTimeout(r, action.draft ? 500 : 10)); // the draft's request is slow
      arrived.push(action);
      return Response.json({ game });
    }));
    const { result } = renderHook(() => useGameSession("g1", { playerId: "h", token: "t" }));
    const { act: send } = result.current.controls!;
    await act(async () => {
      const draft = send({ type: "guess", year: 1990, draft: true });
      const done = send({ type: "guess", year: 1990 });
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.all([draft, done]);
    });
    expect(arrived).toEqual([{ type: "guess", year: 1990, draft: true }, { type: "guess", year: 1990 }]);
  });

  it("a hanging request holds the next action up for a few seconds at most", async () => {
    const sent: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.endsWith("/action")) return new Response(null, { status: 200 });
      const action = JSON.parse(String(init!.body));
      sent.push(action);
      if (action.draft) await new Promise(() => {}); // never answers
      return Response.json({ game });
    }));
    const { result } = renderHook(() => useGameSession("g1", { playerId: "h", token: "t" }));
    const { act: send } = result.current.controls!;
    await act(async () => {
      void send({ type: "guess", year: 1990, draft: true });
      void send({ type: "buzz" });
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(sent).toEqual([{ type: "guess", year: 1990, draft: true }, { type: "buzz" }]);
  });
});
