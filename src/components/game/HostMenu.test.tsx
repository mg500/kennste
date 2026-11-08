// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameView } from "./GameView";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game, Track } from "@/lib/game/types";
import type { GameApi } from "@/lib/game/client";

const playlist: Track[] = [1, 2, 3].map(i => ({ id: `p${i}`, name: `Song ${i}`, artist: "A", releaseYear: "1990", albumArt: null, previewUrl: null }));

function run(game: Game, ...steps: [string, Action][]): Game {
  for (const [actor, action] of steps) {
    const r = applyAction(game, actor, action, { now: 0, random: () => 0, playlist });
    if (!r.ok) throw new Error(r.error);
    game = r.game;
  }
  return game;
}

function playing(): Game {
  let game = newGame("g1", 0);
  for (const [i, id] of ["h", "a"].entries()) game = addPlayer(game, { id, name: id.toUpperCase(), joinedAt: i })!;
  for (const action of [{ type: "setMode", mode: "year" }, { type: "start" }] as Action[]) {
    const r = applyAction(game, "h", action, { now: 0, random: () => 0, playlist });
    if (!r.ok) throw new Error(r.error);
    game = r.game;
  }
  return { ...game, playlistInfo: { name: "Hits der 80er", image: null }, playlistTrackCount: 120 };
}

afterEach(cleanup);

describe("host menu during the game", () => {
  it("shows the playlist and how far the game got – changing it is only possible in the lobby", () => {
    const api = {} as GameApi;
    render(<GameView game={playing()} controls={{ api, act: async () => {}, applyGame: () => {} }} myId="h" playback={null} notice={null} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Spielmenü" })[0]);
    expect(screen.getByText("Hits der 80er")).toBeTruthy();
    expect(screen.getByText("1 von 120 gespielt")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Wechseln" })).toBeNull();
  });

  it("offers the playback device and the TV during the game", () => {
    render(<GameView game={playing()} controls={{ api: {} as GameApi, act: async () => {}, applyGame: () => {} }} myId="h" playback={null} notice={null} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Spielmenü" })[0]);
    const menu = within(screen.getByRole("dialog", { name: "Spielmenü" }));
    expect(menu.getByRole("button", { name: "Wiedergabe: aktives Gerät" })).toBeTruthy();
    expect(menu.getByRole("button", { name: "TV verbinden" })).toBeTruthy();
    expect(menu.getByRole("link", { name: "TV-Ansicht öffnen" }).getAttribute("target")).toBe("_blank");
  });

  it("groups the rows: music, TV, this device, ending – continuing comes first, and only after a reveal", () => {
    const view = (game: Game) => <GameView game={game} controls={{ api: {} as GameApi, act: async () => {}, applyGame: () => {} }} myId="h" playback={null} notice={null} />;
    const { rerender } = render(view(playing()));
    fireEvent.click(screen.getAllByRole("button", { name: "Spielmenü" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Spielmenü" });
    expect(within(dialog).getAllByRole("heading", { level: 3 }).map(h => h.textContent)).toEqual(["Musik", "Fernseher", "Dieses Gerät", "Beenden"]);
    expect(within(dialog).queryByRole("button", { name: "Runde weiterschalten" })).toBeNull();

    const revealed = run(playing(), ["h", { type: "guess", year: 1990 }], ["a", { type: "guess", year: 1990 }]);
    rerender(view(revealed));
    const next = within(screen.getByRole("dialog", { name: "Spielmenü" })).getByRole("button", { name: "Runde weiterschalten" });
    expect(next.compareDocumentPosition(within(dialog).getByRole("heading", { name: "Musik" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the style row switches the style of this device", () => {
    render(<GameView game={playing()} controls={{ api: {} as GameApi, act: async () => {}, applyGame: () => {} }} myId="h" playback={null} notice={null} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Spielmenü" })[0]);
    const menu = within(screen.getByRole("dialog", { name: "Spielmenü" }));
    fireEvent.click(menu.getByRole("button", { name: "Stil: Bühne" }));
    expect(document.documentElement.dataset.theme).toBe("minimal");
    delete document.documentElement.dataset.theme;
  });

  it("ending says what it does, and asks first", async () => {
    const act = vi.fn(async () => {});
    render(<GameView game={playing()} controls={{ api: {} as GameApi, act, applyGame: () => {} }} myId="h" playback={null} notice={null} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Spielmenü" })[0]);
    const menu = within(screen.getByRole("dialog", { name: "Spielmenü" }));
    const back = menu.getByRole("button", { name: "Zurück zur Lobby" });
    expect(back.getAttribute("aria-describedby") && document.getElementById(back.getAttribute("aria-describedby")!)!.textContent).toBe("Spiel abbrechen, die Punkte verfallen");
    fireEvent.click(back);
    expect(act).not.toHaveBeenCalled();
    fireEvent.click(menu.getByRole("button", { name: "Zur Lobby" }));
    expect(act).toHaveBeenCalledWith({ type: "reset" });
  });

  it("leaves the device and the TV out in the lobby – both are right there already", () => {
    let game = newGame("g1", 0);
    game = addPlayer(game, { id: "h", name: "H", joinedAt: 0 })!;
    render(<GameView game={game} controls={{ api: {} as GameApi, act: async () => {}, applyGame: () => {} }} myId="h" playback={null} notice={null} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Spielmenü" })[0]);
    const menu = within(screen.getByRole("dialog", { name: "Spielmenü" }));
    expect(menu.queryByRole("button", { name: /^Wiedergabe/ })).toBeNull();
    expect(menu.queryByRole("button", { name: "Zurück zur Lobby" })).toBeNull(); // nothing running yet
    expect(menu.queryByRole("button", { name: "TV verbinden" })).toBeNull();
    expect(menu.queryByRole("link", { name: "TV-Ansicht öffnen" })).toBeNull();
    expect(menu.getByRole("button", { name: "Lobby schließen" })).toBeTruthy();
  });

  it("shows the version and a link to the source code at the bottom", () => {
    render(<GameView game={playing()} controls={{ api: {} as GameApi, act: async () => {}, applyGame: () => {} }} myId="h" playback={null} notice={null} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Spielmenü" })[0]);
    expect(screen.getByText(/^Kennste\?! v\d+\.\d+\.\d+/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Quellcode auf GitHub/ }).getAttribute("href")).toBe("https://github.com/mg500/kennste");
  });
});
