// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameView } from "../../GameView";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game, Track } from "@/lib/game/types";
import type { GameApi } from "@/lib/game/client";

const playlist: Track[] = [{ id: "p1", name: "Secret Song", artist: "Secret Artist", releaseYear: "1984", albumArt: null, previewUrl: null }];

function buzzed(...more: Action[]): Game {
  let game = newGame("g1", 0);
  for (const [i, id] of ["h", "a"].entries()) game = addPlayer(game, { id, name: id.toUpperCase(), joinedAt: i })!;
  for (const [actor, action] of [["h", { type: "setMode", mode: "versus" }], ["h", { type: "start" }], ["a", { type: "buzz" }], ...more.map(a => ["a", a])] as [string, Action][]) {
    const r = applyAction(game, actor, action, { now: Date.now(), random: () => 0, playlist });
    if (!r.ok) throw new Error(r.error);
    game = r.game;
  }
  return game;
}

afterEach(cleanup);

describe("Alle gegen alle: answering", () => {
  it("the buzzer answers first, then gets the song from the server and judges with a tap", async () => {
    const answer = vi.fn(async () => ({ name: "Secret Song", artist: "Secret Artist", releaseYear: "1984", albumArt: null }));
    const act$ = vi.fn(async () => {});
    const controls = { api: { answer } as unknown as GameApi, act: act$, applyGame: () => {} };
    const { rerender } = render(<GameView game={buzzed()} controls={controls} myId="a" playback={null} notice={null} />);
    await act(async () => {});
    expect(answer).not.toHaveBeenCalled(); // no peeking while answering
    fireEvent.click(screen.getByRole("button", { name: /Lösung zeigen/ }));
    expect(act$).toHaveBeenCalledWith({ type: "answered" });

    rerender(<GameView game={buzzed({ type: "answered" })} controls={controls} myId="a" playback={null} notice={null} />);
    await act(async () => {});
    expect(answer).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Secret Song")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Richtig/ }));
    expect(act$).toHaveBeenCalledWith({ type: "judge", verdict: "correct" });
  });
});
