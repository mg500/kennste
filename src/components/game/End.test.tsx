// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPlayer, newGame } from "@/lib/game/reducer";
import type { Game, PlayerRoundStats, RoundRecord } from "@/lib/game/types";
import { EndContent, TvEnd } from "./End";

const song = (n: number): RoundRecord["song"] => ({ trackId: `t${n}`, name: `Song ${n}`, artist: `Artist ${n}`, releaseYear: "1985", albumArt: null });

/** "Alle gegen alle" just finished: Lea won three songs in a row, Tom was fastest, Ben buzzed a lot. */
function finished(rounds?: [Record<string, number>, Record<string, PlayerRoundStats>][]): Game {
  let g = newGame("g1", 0);
  for (const [i, name] of ["Max", "Lea", "Tom", "Ben"].entries()) g = addPlayer(g, { id: name.toLowerCase(), name, joinedAt: i })!;
  const history = (rounds ?? [
    [{ lea: 1 }, { lea: { buzzes: 1, rightMs: 4000 }, ben: { buzzes: 2 } }],
    [{ lea: 1 }, { lea: { buzzes: 1, rightMs: 5000 }, ben: { buzzes: 2 } }],
    [{ lea: 1 }, { lea: { buzzes: 1, rightMs: 6000 }, ben: { buzzes: 1 } }],
    [{ tom: 1 }, { tom: { buzzes: 1, rightMs: 1800 } }],
    [{}, {}],
  ]).map(([points, stats], i) => ({ round: i + 1, song: song(i + 1), points, stats: { max: {}, lea: {}, tom: {}, ben: {}, ...stats } }));
  return { ...g, status: "finished", mode: { ...g.mode, id: "versus" } as Game["mode"], scores: { lea: 3, tom: 1, max: 0, ben: 0 }, history };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("End screen on the phone", () => {
  it("Endstand: the winner on the podium and the first awards; the other tabs show all awards and every song", () => {
    render(<EndContent game={finished()} myId="lea" actions={<button>Neues Spiel</button>} />);
    expect(screen.getByRole("heading", { name: "Du gewinnst!" })).toBeTruthy();
    expect(screen.getByText("3 Punkte · 5 Songs · Alle gegen alle")).toBeTruthy();
    expect(within(screen.getAllByLabelText("Podest")[0]).getByText("Lea")).toBeTruthy();
    expect(screen.getAllByText("Blitzmerker").length).toBeGreaterThan(0);
    expect(screen.getByText("Tom · „Song 4“ nach 1,8 s erkannt")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Songs" }));
    expect(screen.getAllByText("5 Songs · 4 erraten").length).toBeGreaterThan(0);
    const songs = screen.getByRole("list", { name: "Alle Songs" });
    expect(within(songs).getByRole("link", { name: /Song 1/ }).getAttribute("href")).toBe("https://open.spotify.com/track/t1");
    expect(within(songs).getByRole("img", { name: "Niemand hat ihn erraten" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Neues Spiel" }).length).toBeGreaterThan(0);
  });

  it("without anything special there is no awards tab", () => {
    render(<EndContent game={finished([[{ lea: 1 }, {}]])} actions={null} />);
    expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["Endstand", "Songs"]);
  });
});

describe("End screen on the TV", () => {
  it("shows podium, awards and songs one after another", async () => {
    render(<TvEnd game={finished()} />);
    expect(screen.getByLabelText("Podest")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByRole("heading", { name: "Auszeichnungen" })).toBeTruthy();
    expect(screen.getByText("Serie")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByRole("heading", { name: "Die Songs" })).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByLabelText("Podest")).toBeTruthy();
    expect(screen.getByText(/Warte auf Max für eine Revanche/)).toBeTruthy();
  });
});
