// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game, Track } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { GameView } from "./GameView";
import { headline, ScoreInterlude, type ScoreEvent } from "./RoundPoints";
import { SPLASH_MS } from "./Splash";

const playlist: Track[] = ["p1", "p2", "p3"].map(id => ({ id, name: `Song ${id}`, artist: "Artist", releaseYear: "1987", albumArt: null, previewUrl: null }));
const controls: GameControls = { api: {} as GameControls["api"], act: async () => {}, applyGame: () => {} };

function run(game: Game, ...steps: [string, Action][]): Game {
  for (const [actor, action] of steps) {
    const r = applyAction(game, actor, action, { now: 0, random: () => 0, playlist });
    if (!r.ok) throw new Error(r.error);
    game = r.game;
  }
  return game;
}

/** "Jahr schätzen" with H, A and B, the first song playing. */
function playing(): Game {
  let game = newGame("g1", 0);
  for (const [i, id] of ["h", "a", "b"].entries()) game = addPlayer(game, { id, name: id.toUpperCase(), joinedAt: i })!;
  return run(game, ["h", { type: "setMode", mode: "year" }], ["h", { type: "start" }]);
}

const guesses = (h: number, a: number, b: number): [string, Action][] =>
  [["h", { type: "guess", year: h }], ["a", { type: "guess", year: a }], ["b", { type: "guess", year: b }]];

const view = (game: Game, myId = "a") => <GameView game={game} controls={controls} myId={myId} playback={null} notice={null} />;
const wait = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Points after a round", () => {
  it("your points pop up after the round's result, with the standings – then it goes away", async () => {
    const before = playing();
    const { rerender } = render(view(before));
    await wait(SPLASH_MS + 100);
    expect(screen.queryByRole("dialog", { name: "Punkte dieser Runde" })).toBeNull();

    rerender(view(run(before, ...guesses(1980, 1987, 1986)))); // A exact: 3, B: 2
    await wait(500);
    expect(screen.queryByRole("dialog")).toBeNull(); // the result comes first
    await wait(1100);
    expect(screen.getAllByText("+3").length).toBeGreaterThan(0);
    expect(screen.getByText("3 Punkte für dich!")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Zwischenstand" }).textContent).toContain("Du");
    await wait(3500);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("without points of your own: who scored; tapping closes it", async () => {
    const before = playing();
    const { rerender } = render(view(before, "h"));
    rerender(view(run(before, ...guesses(1950, 1987, 1986)), "h"));
    await wait(1600);
    expect(screen.getByText("Diesmal kein Punkt")).toBeTruthy();
    expect(screen.getByText("A geht in Führung!")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("not when the game starts, after a reload or once the next round has begun", async () => {
    const lobby = run(addPlayer(newGame("g1", 0), { id: "h", name: "H", joinedAt: 0 })!, ["h", { type: "setMode", mode: "timeline" }]);
    const { rerender } = render(view(lobby, "h"));
    rerender(view(run(lobby, ["h", { type: "start" }]), "h")); // the start card counts as a point
    await wait(SPLASH_MS + 2000);
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();

    const revealed = run(playing(), ...guesses(1987, 1987, 1987));
    render(view(revealed)); // opened (or reloaded) after the reveal
    await wait(2000);
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();

    const before = playing();
    const { rerender: again } = render(view(before));
    const scored = run(before, ...guesses(1987, 1987, 1987));
    again(view(scored));
    again(view(run(scored, ["h", { type: "next" }]))); // the host moved on right away
    await wait(2000);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the TV shows the standings with the round's best, a moment after the result", async () => {
    const before = playing();
    const { rerender } = render(<ScoreInterlude game={before} />);
    rerender(<ScoreInterlude game={run(before, ...guesses(1980, 1987, 1986))} />);
    await wait(2000);
    expect(screen.queryByRole("status", { name: "Zwischenstand" })).toBeNull();
    await wait(600);
    expect(screen.getByText("A geht in Führung!")).toBeTruthy();
    expect(screen.getAllByText("+3").length).toBeGreaterThan(0);
    await wait(4600);
    expect(screen.queryByRole("status", { name: "Zwischenstand" })).toBeNull();
  });
});

describe("headline", () => {
  const game = playing();
  const event = (before: Record<string, number>, after: Record<string, number>): ScoreEvent => ({ before, after, round: 1, key: 1 });
  it("says who took the lead, else who scored most", () => {
    expect(headline(game, event({ h: 2, a: 1, b: 0 }, { h: 2, a: 4, b: 0 }))).toBe("A geht in Führung!");
    expect(headline(game, event({ h: 2, a: 1, b: 0 }, { h: 2, a: 4, b: 0 }), "a")).toBe("Du gehst in Führung!");
    expect(headline(game, event({ h: 5, a: 1, b: 0 }, { h: 6, a: 3, b: 0 }))).toBe("A holt +2");
    expect(headline(game, event({ h: 5, a: 1, b: 0 }, { h: 5, a: 3, b: 2 }))).toBe("A und B holen +2");
  });
});
