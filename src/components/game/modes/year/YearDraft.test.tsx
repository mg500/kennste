// @vitest-environment happy-dom
import { act as flush, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameView } from "../../GameView";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game, Track } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";

const playlist: Track[] = [{ id: "p1", name: "Song", artist: "Artist", releaseYear: "1987", albumArt: null, previewUrl: null }];

function started(): Game {
  let game = newGame("g1", 0);
  for (const [i, id] of ["h", "a"].entries()) game = addPlayer(game, { id, name: id.toUpperCase(), joinedAt: i })!;
  for (const action of [{ type: "setMode", mode: "year" }, { type: "start" }] as Action[]) {
    const r = applyAction(game, "h", action, { now: 0, random: () => 0, playlist });
    if (!r.ok) throw new Error(r.error);
    game = r.game;
  }
  return game;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Jahr schätzen: picking a year", () => {
  it("sends the picked year as a draft, so it counts when the time is up; \"Fertig\" makes it final", async () => {
    const act = vi.fn(async () => {});
    const controls: GameControls = { api: {} as GameControls["api"], act, applyGame: () => {} };
    render(<GameView game={started()} controls={controls} myId="a" playback={null} notice={null} />);
    await flush(async () => { vi.advanceTimersByTime(400); });
    expect(act.mock.calls).toEqual([[{ type: "guess", year: 1990, draft: true }]]); // the year shown counts, even untouched

    fireEvent.click(screen.getByRole("button", { name: "70er" }));
    fireEvent.click(screen.getByRole("button", { name: "Plus 1 Jahr" }));
    await flush(async () => { vi.advanceTimersByTime(400); });
    expect(act.mock.calls.at(-1)).toEqual([{ type: "guess", year: 1976, draft: true }]);

    fireEvent.click(screen.getByRole("button", { name: "Plus 1 Jahr" }));
    fireEvent.click(screen.getByRole("button", { name: /Fertig/ }));
    await flush(async () => { vi.advanceTimersByTime(400); });
    expect(act.mock.calls.at(-1)).toEqual([{ type: "guess", year: 1977 }]);
    expect(act).toHaveBeenCalledTimes(3); // the pending draft was dropped, it would undo "Fertig"
  });

  it("doesn't send the starting year again after a reload, and never for viewers", async () => {
    const act = vi.fn(async () => {});
    const controls: GameControls = { api: {} as GameControls["api"], act, applyGame: () => {} };
    const r = applyAction(started(), "a", { type: "guess", year: 1984, draft: true }, { now: 0, random: () => 0, playlist });
    if (!r.ok) throw new Error(r.error);
    render(<GameView game={r.game} controls={controls} myId="a" playback={null} notice={null} />);
    expect(screen.getByText("1984")).toBeTruthy();
    render(<GameView game={started()} controls={controls} myId="viewer" playback={null} notice={null} />);
    await flush(async () => { vi.advanceTimersByTime(400); });
    expect(act).not.toHaveBeenCalled();
  });
});
