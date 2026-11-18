// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game, Track } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { GameView } from "./GameView";
import { COUNT_DELAY_MS, GAIN_MS, headline, MORPH_MS, ScoreCountProvider, ScoreHeadline, type ScoreEvent } from "./RoundPoints";
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

/** The score chips at the top of a phone, as "name score" in their order, with "+N" where shown. */
const chips = () => [...within(screen.getByRole("button", { name: "Punktestand anzeigen" })).getByText((_, el) => el?.tagName === "BUTTON").children]
  .map(chip => chip.textContent!.slice(1).replace(":", " ")); // without the avatar's initial

describe("Points after a round", () => {
  it("the result stays: the chips count up in place, who scored gets \"+N\", the order follows", async () => {
    const before = playing();
    const { rerender } = render(view(before));
    await wait(SPLASH_MS + 100);
    expect(chips()).toEqual(["H 0", "A 0", "B 0"]);

    rerender(view(run(before, ...guesses(1980, 1987, 1986)))); // A exact: 3, B: 2
    expect(chips()).toEqual(["H 0", "A 0", "B 0"]); // the result comes first
    await wait(COUNT_DELAY_MS + 2000);
    expect(chips()).toEqual(["A 3+3", "B 2+2", "H 0"]);
    expect(screen.queryByRole("dialog")).toBeNull(); // nothing on top of the result
    await wait(GAIN_MS);
    expect(chips()).toEqual(["A 3", "B 2", "H 0"]);
  });

  it("not when the game starts, after a reload or once the next round has begun", async () => {
    const lobby = run(addPlayer(newGame("g1", 0), { id: "h", name: "H", joinedAt: 0 })!, ["h", { type: "setMode", mode: "timeline" }]);
    const { rerender } = render(view(lobby, "h"));
    rerender(view(run(lobby, ["h", { type: "start" }]), "h")); // the start card counts as a point
    await wait(SPLASH_MS + COUNT_DELAY_MS + 100);
    expect(chips()).toEqual(["H 1"]);
    cleanup();

    const revealed = run(playing(), ...guesses(1987, 1987, 1987));
    render(view(revealed)); // opened (or reloaded) after the reveal
    await wait(COUNT_DELAY_MS + 100);
    expect(chips()).toEqual(["H 3", "A 3", "B 3"]);
    cleanup();

    const before = playing();
    const { rerender: again } = render(view(before));
    const scored = run(before, ...guesses(1987, 1987, 1987));
    again(view(scored));
    again(view(run(scored, ["h", { type: "next" }]))); // the host moved on right away
    expect(chips()).toEqual(["H 3", "A 3", "B 3"]);
  });

  it("the TV says who took the lead while the points count up, at the same moment as the phones", async () => {
    const before = playing();
    const after = run(before, ...guesses(1980, 1987, 1986));
    const tv = (game: Game) => <ScoreCountProvider game={game}><ScoreHeadline game={game} /></ScoreCountProvider>;
    const [onTv, onPhone] = [render(tv(before)), render(view(before))];
    onTv.rerender(tv(after));
    onPhone.rerender(view(after));
    await wait(COUNT_DELAY_MS - 100);
    expect(screen.queryByText("A geht in Führung!")).toBeNull();
    expect(chips()).toEqual(["H 0", "A 0", "B 0"]);
    await wait(200);
    expect(screen.getByText("A geht in Führung!")).toBeTruthy();
    expect(chips().some(c => c.includes("+3"))).toBe(true);
    await wait(GAIN_MS);
    expect(screen.queryByText("A geht in Führung!")).toBeNull();
  });
});

describe("Standings on demand", () => {
  it("a tap on the score chips shows everyone's points, until closed", async () => {
    const game = run(playing(), ...guesses(1980, 1987, 1986)); // A 3, B 2, H 0
    render(view(game, "h"));
    await wait(SPLASH_MS + 100);
    fireEvent.click(screen.getByRole("button", { name: "Punktestand anzeigen" }));
    // Each row: place, avatar, name, points
    const rows = within(screen.getByRole("dialog", { name: "Zwischenstand" })).getAllByRole("listitem").map(li => li.textContent);
    expect(rows).toEqual(["3HDu0", "1AA3", "2BB2"]);
    await wait(10_000);
    expect(screen.getByRole("dialog", { name: "Zwischenstand" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    await wait(MORPH_MS);
    expect(screen.queryByRole("dialog", { name: "Zwischenstand" })).toBeNull();
  });

  it("the standings grow out of the score chips and fly back into them, so you know where to tap", async () => {
    const game = run(playing(), ...guesses(1980, 1987, 1986));
    const animate = vi.fn();
    HTMLElement.prototype.animate = animate as unknown as HTMLElement["animate"];
    const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height, top: y, left: x, right: x + width, bottom: y + height, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute("data-standings-home") ? rect(100, 20, 200, 36) : rect(0, 0, 400, 800);
    });
    try {
      render(view(game, "h"));
      await wait(SPLASH_MS + 100);
      fireEvent.click(screen.getByRole("button", { name: "Punktestand anzeigen" }));
      const grow = animate.mock.calls.find(([frames]) => frames.length === 3);
      expect(grow![0][0].transform).toBe("translate(0px, -362px) scale(0.5)"); // starts small, at the chips
      animate.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
      const fly = animate.mock.calls.find(([frames]) => frames.length === 3);
      expect(fly![0][2].transform).toBe("translate(0px, -362px) scale(0.5)"); // ends there
    } finally {
      delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
      vi.restoreAllMocks();
    }
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
    expect(headline(game, event({ h: 0, a: 0, b: 0 }, { h: 3, a: 3, b: 3 }))).toBe("H, A und B holen +3");
  });
});
