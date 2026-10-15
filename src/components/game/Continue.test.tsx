// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameApi } from "@/lib/game/client";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game, Reaction } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { ContinueBar, ReactionsContext } from "./Continue";

const track = { id: "t1", name: "Song", artist: "A", albumArt: null, previewUrl: null };

/** Buzzer game after a revealed round: H picked the song, A continues. */
function revealed(): Game {
  let g = newGame("g1", 0);
  for (const [i, id] of ["h", "a", "b"].entries()) g = addPlayer(g, { id, name: id.toUpperCase(), joinedAt: i })!;
  for (const action of [{ type: "start" }, { type: "pickSong", track }, { type: "reveal" }] as Action[]) {
    const r = applyAction(g, "h", action, { now: 0, random: () => 0 });
    if (!r.ok) throw new Error(r.error);
    g = r.game;
  }
  return g;
}

function controls() {
  const react = vi.fn(async () => true);
  return { react, controls: { api: { react } as unknown as GameApi, act: async () => {}, applyGame: () => {} } satisfies GameControls };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("ContinueBar", () => {
  it("others nudge the next player, then wait a moment", async () => {
    const { react, controls: c } = controls();
    render(<ContinueBar game={revealed()} controls={c} myId="b" label="Weiter" onContinue={() => {}} />);
    expect(screen.getByText("macht weiter")).toBeTruthy();
    expect(screen.queryByText("Weiter")).toBeNull();

    await act(async () => { fireEvent.click(screen.getByLabelText("Song skippen")); });
    expect(react).toHaveBeenCalledWith("skip");
    expect(screen.getByText("Angestupst")).toBeTruthy();
    expect((screen.getByLabelText("Feier ich") as HTMLButtonElement).disabled).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(2500));
    expect((screen.getByLabelText("Feier ich") as HTMLButtonElement).disabled).toBe(false);
  });

  it("the next player gets the button, a buzz and the reactions", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    const onContinue = vi.fn();
    const reactions: Reaction[] = [{ id: "r1", playerId: "b", kind: "skip", at: 0 }];
    const { rerender } = render(
      <ReactionsContext value={[]}><ContinueBar game={revealed()} controls={controls().controls} myId="a" label="Weiter" onContinue={onContinue} /></ReactionsContext>,
    );
    expect(screen.getByText("Du bist dran – alle warten auf dich")).toBeTruthy();
    expect(vibrate).toHaveBeenCalledTimes(1);

    rerender(<ReactionsContext value={reactions}><ContinueBar game={revealed()} controls={controls().controls} myId="a" label="Weiter" onContinue={onContinue} /></ReactionsContext>);
    expect(screen.getAllByLabelText("B: Song skippen").length).toBeGreaterThan(0);
    expect(vibrate).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: /Weiter/ }));
    expect(onContinue).toHaveBeenCalled();
  });
});
