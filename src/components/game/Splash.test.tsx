// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game, Track } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { GameView } from "./GameView";
import { SPLASH_MS } from "./Splash";

const playlist: Track[] = [{ id: "p1", name: "Song", artist: "Artist", releaseYear: "1987", albumArt: null, previewUrl: null }];
const controls: GameControls = { api: {} as GameControls["api"], act: async () => {}, applyGame: () => {} };

function run(game: Game, ...actions: Action[]): Game {
  for (const action of actions) {
    const r = applyAction(game, "h", action, { now: 0, random: () => 0, playlist });
    if (!r.ok) throw new Error(r.error);
    game = r.game;
  }
  return game;
}

function lobby(): Game {
  let game = newGame("g1", 0);
  for (const [i, id] of ["h", "a"].entries()) game = addPlayer(game, { id, name: id.toUpperCase(), joinedAt: i })!;
  return run(game, { type: "setMode", mode: "year" });
}

const view = (game: Game) => <GameView game={game} controls={controls} myId="a" playback={null} notice={null} />;

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Logo when the game starts or everyone is back in the lobby", () => {
  it("pops up on the start and goes away by itself", async () => {
    const before = lobby();
    const { rerender } = render(view(before));
    expect(screen.queryByText("Los geht's!")).toBeNull();

    rerender(view(run(before, { type: "start" })));
    expect(screen.getByText("Los geht's!")).toBeTruthy();
    expect(screen.getByText("Jahr schätzen · 10 Runden")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(SPLASH_MS); }); // fades out …
    await act(async () => { vi.advanceTimersByTime(400); }); // … and is gone
    expect(screen.queryByText("Los geht's!")).toBeNull();
  });

  it("back in the lobby too; a tap skips it", () => {
    const started = run(lobby(), { type: "start" });
    const { rerender } = render(view(started));
    rerender(view(run(started, { type: "reset" })));
    expect(screen.getByText("Zurück in der Lobby")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Logo ausblenden" }));
    expect(screen.queryByText("Zurück in der Lobby")).toBeNull();
  });

  it("not when the page is (re)loaded into a running game", () => {
    render(view(run(lobby(), { type: "start" })));
    expect(screen.queryByText("Los geht's!")).toBeNull();
  });
});

describe("Countdown to the start", () => {
  const counting = (game: Game, patch: Partial<NonNullable<Game["countdown"]>> = {}): Game => {
    const g = run(game, { type: "updateSettings", patch: { songSource: "playlist" } }, { type: "countdown" });
    return { ...g, countdown: { ...g.countdown!, ...patch } };
  };

  it("counts down in the logo, says what's being prepared, then the start takes over", async () => {
    vi.setSystemTime(10_000);
    const before = counting(lobby(), { endsAt: 15_000 });
    const { rerender } = render(view(before));
    expect(screen.getByLabelText("Noch 5 Sekunden")).toBeTruthy();
    expect(screen.getByText("Gleich geht's los")).toBeTruthy();
    expect(screen.getAllByText("Songs werden geladen").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Abbrechen" })).toBeNull(); // only the host

    rerender(view({ ...before, countdown: { ...before.countdown!, songs: 30, years: true } }));
    expect(screen.getAllByText("30 Songs geladen").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Erscheinungsjahre geprüft").length).toBeGreaterThan(0);
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(screen.getByLabelText("Noch 3 Sekunden")).toBeTruthy();

    // Time's up, the server isn't done yet
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText("?!")).toBeTruthy();
    expect(screen.getByText("Musik wird vorbereitet …")).toBeTruthy();

    rerender(view(run(before, { type: "start" })));
    expect(screen.getByText("Los geht's!")).toBeTruthy();
  });

  it("the host can call it off", () => {
    const act = vi.fn(async () => {});
    render(<GameView game={counting(lobby())} controls={{ ...controls, act }} myId="h" playback={null} notice={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(act).toHaveBeenCalledWith({ type: "cancelCountdown" });
  });
});
