// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPlayer, newGame } from "@/lib/game/reducer";
import type { Game, PlayerRoundStats, RoundRecord } from "@/lib/game/types";
import { EndContent, SavePlaylist, TvEnd } from "./End";
import type { GameControls } from "@/lib/game/useGameSession";

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

  it("swipes between the tabs like in an app; scrolling, the screen edge and the mouse don't switch", () => {
    render(<EndContent game={finished()} myId="lea" actions={<button>Neues Spiel</button>} />);
    const selected = () => screen.getAllByRole("tab").find(t => t.getAttribute("aria-selected") === "true")!.textContent;
    const area = screen.getByRole("heading", { name: "Du gewinnst!" });
    const swipe = (fromX: number, dx: number, dy = 0, pointerType = "touch") => {
      fireEvent.pointerDown(area, { pointerType, pointerId: 1, clientX: fromX, clientY: 300 });
      fireEvent.pointerUp(area, { pointerType, pointerId: 1, clientX: fromX + dx, clientY: 300 + dy });
    };
    swipe(300, -120);
    expect(selected()).toBe("Auszeichnungen");
    swipe(300, -120);
    expect(selected()).toBe("Songs");
    swipe(300, -120); // already the last one
    expect(selected()).toBe("Songs");
    swipe(100, 120);
    expect(selected()).toBe("Auszeichnungen");

    swipe(100, 80, 200); // mostly down: scrolling
    swipe(10, 120); // from the edge: the browser's back gesture
    swipe(100, 120, 0, "mouse");
    swipe(100, 40); // too short
    expect(selected()).toBe("Auszeichnungen");
  });

  it("a swipe ending on a button doesn't press it", () => {
    const save = vi.fn();
    render(<EndContent game={finished()} myId="lea" actions={null} songActions={<button onClick={save}>Speichern</button>} />);
    fireEvent.click(screen.getByRole("tab", { name: "Songs" }));
    const button = screen.getByRole("button", { name: "Speichern" });
    fireEvent.pointerDown(button, { pointerType: "touch", pointerId: 1, clientX: 100, clientY: 300 });
    fireEvent.pointerUp(button, { pointerType: "touch", pointerId: 1, clientX: 220, clientY: 300 });
    fireEvent.click(button);
    expect(screen.getByRole("tab", { name: "Auszeichnungen" }).getAttribute("aria-selected")).toBe("true");
    expect(save).not.toHaveBeenCalled();
    fireEvent.pointerDown(button, { pointerType: "touch", pointerId: 2, clientX: 100, clientY: 300 });
    fireEvent.click(button); // a plain tap afterwards works
    expect(save).toHaveBeenCalledTimes(1);
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

describe("Saving the songs as a playlist (host)", () => {
  it("saves on a tap, shows Spotify's error, and the link once saved", async () => {
    const savePlaylist = vi.fn(async () => ({ error: "Spotify erlaubt das Speichern noch nicht – melde dich einmal ab und wieder an" }));
    const controls = { api: { savePlaylist }, act: async () => {}, applyGame: () => {} } as unknown as GameControls;
    const { rerender } = render(<SavePlaylist game={finished()} controls={controls} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Als Spotify-Playlist speichern/ })); });
    expect(savePlaylist).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toContain("melde dich einmal ab und wieder an");

    rerender(<SavePlaylist game={{ ...finished(), savedPlaylist: { url: "https://open.spotify.com/playlist/p1" } }} controls={controls} />);
    expect(screen.getByRole("link", { name: /Gespeichert – in Spotify öffnen/ }).getAttribute("href")).toBe("https://open.spotify.com/playlist/p1");
  });
});
