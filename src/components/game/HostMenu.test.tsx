// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  it("shows the playlist and lets the host change it; the new one takes over with the next song", async () => {
    const api = { searchPlaylists: vi.fn(async () => []), loadPlaylist: vi.fn() } as unknown as GameApi;
    const view = (game: Game) => <GameView game={game} controls={{ api, act: async () => {}, applyGame: () => {} }} myId="h" playback={null} notice={null} />;
    const { rerender } = render(view(playing()));
    fireEvent.click(screen.getAllByRole("button", { name: "Spielmenü" })[0]);
    expect(screen.getByText("Hits der 80er")).toBeTruthy();
    expect(screen.getByText("1 von 120 gespielt")).toBeTruthy();

    rerender(view({ ...playing(), pendingPlaylist: { name: "Hits der 90er", image: null } }));
    expect(screen.getByRole("status").textContent).toContain("Ab dem nächsten Song kommt die Musik aus „Hits der 90er“");

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Wechseln" })); });
    expect(screen.getByLabelText("Playlist suchen")).toBeTruthy();
  });
});
