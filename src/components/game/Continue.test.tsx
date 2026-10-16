// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { ContinueBar, WaitingForNext } from "./Continue";

const track = { id: "t1", name: "Song", artist: "A", albumArt: null, previewUrl: null };
const NOW = 100_000;

function run(g: Game, actor: string, action: Action, now = NOW): Game {
  const r = applyAction(g, actor, action, { now, random: () => 0 });
  if (!r.ok) throw new Error(r.error);
  return r.game;
}

/** Buzzer game after a revealed round: H picked the song, A continues, H and B may vote (2 needed). C watches. */
function revealed(): Game {
  let g = newGame("g1", 0);
  for (const [i, id] of ["h", "a", "b", "c"].entries()) g = addPlayer(g, { id, name: id.toUpperCase(), joinedAt: i })!;
  g = run(g, "h", { type: "toggleViewer", playerId: "c" });
  for (const action of [{ type: "start" }, { type: "pickSong", track }, { type: "reveal" }] as Action[]) g = run(g, "h", action);
  return g;
}
const voted = (...ids: string[]) => ids.reduce((g, id) => run(g, id, { type: "voteContinue", want: true }), revealed());

function controls() {
  const act = vi.fn(async () => {});
  return { act, controls: { api: {} as GameControls["api"], act, applyGame: () => {} } satisfies GameControls };
}

const bar = (game: Game, myId: string, c = controls().controls, onContinue = () => {}) =>
  <ContinueBar game={game} controls={c} myId={myId} label="Weiter" onContinue={onContinue} />;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("ContinueBar", () => {
  it("the others vote to continue and can take it back", () => {
    const { act, controls: c } = controls();
    const { rerender } = render(bar(revealed(), "b", c));
    expect(screen.getByText("macht weiter")).toBeTruthy();
    expect(screen.getByText("Will die Mehrheit weitermachen, geht's automatisch weiter")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Weiter$/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Weiter geht's!/ }));
    expect(act).toHaveBeenLastCalledWith({ type: "voteContinue", want: true });
    act.mockClear();
    fireEvent.keyDown(window, { key: "w" }); // on the laptop
    expect(act).toHaveBeenLastCalledWith({ type: "voteContinue", want: true });

    rerender(bar(voted("b"), "b", c));
    expect(screen.getByText("Du willst weitermachen – noch 1 Stimme, dann geht's automatisch weiter")).toBeTruthy();
    expect(screen.getByRole("img", { name: "1 von 2 wollen weitermachen" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Doch nicht/ }));
    expect(act).toHaveBeenLastCalledWith({ type: "voteContinue", want: false });
  });

  it("the next player sees who wants to move on and gets a buzz for it", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    const onContinue = vi.fn();
    const { rerender } = render(bar(revealed(), "a", undefined, onContinue));
    expect(screen.getByText("Du bist dran – alle warten auf dich")).toBeTruthy();
    expect(vibrate).toHaveBeenCalledTimes(1);

    rerender(bar(voted("b"), "a", undefined, onContinue));
    expect(screen.getByRole("status").textContent).toMatch(/B will weitermachen.*1\/2/);
    expect(vibrate).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: /Weiter/ }));
    expect(onContinue).toHaveBeenCalled();
  });

  it("counts down for everyone once a majority wants to continue", async () => {
    const game = voted("h", "b");
    render(<>{bar(game, "a")}{bar(game, "b")}</>);
    expect(screen.getByRole("button", { name: /Weiter · in 5 s/ })).toBeTruthy();
    expect(screen.getByText("Die Mehrheit will weitermachen")).toBeTruthy();
    expect(screen.getByText("H und B wollen weitermachen")).toBeTruthy();

    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByRole("button", { name: /Weiter · in 3 s/ })).toBeTruthy();
  });

  it("viewers see the vote but don't take part", () => {
    render(bar(voted("b"), "c"));
    expect(screen.getByText("B will weitermachen – noch 1 Stimme, dann geht's automatisch weiter")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("WaitingForNext (TV)", () => {
  it("shows who wants to continue, then the countdown", () => {
    const { rerender } = render(<WaitingForNext game={voted("b")} />);
    expect(screen.getByText("Warte auf", { exact: false }).textContent).toBe("Warte auf A …");
    expect(screen.getByText("will weitermachen", { exact: false }).textContent).toBe("B will weitermachen");
    expect(screen.getByText("1 von 2")).toBeTruthy();

    rerender(<WaitingForNext game={voted("b", "h")} />);
    expect(screen.queryByText("Warte auf", { exact: false })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Die Mehrheit will weitermachen");
    expect(screen.getByRole("status").textContent).toContain("5");
  });
});
