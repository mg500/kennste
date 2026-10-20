// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GameView } from "./GameView";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game, Track } from "@/lib/game/types";
import type { GameApi } from "@/lib/game/client";

const playlist: Track[] = [1, 2, 3].map(i => ({ id: `p${i}`, name: `Song ${i}`, artist: "A", releaseYear: "1990", albumArt: null, previewUrl: null }));

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

  it("shows the version and a link to the source code at the bottom", () => {
    render(<GameView game={playing()} controls={{ api: {} as GameApi, act: async () => {}, applyGame: () => {} }} myId="h" playback={null} notice={null} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Spielmenü" })[0]);
    expect(screen.getByText(/^Kennste\?! v\d+\.\d+\.\d+/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Quellcode auf GitHub/ }).getAttribute("href")).toBe("https://github.com/mg500/kennste");
  });
});
