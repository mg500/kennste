// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameApi, PlaylistResult } from "@/lib/game/client";
import { addPlayer, newGame } from "@/lib/game/reducer";
import type { Game } from "@/lib/game/types";
import { PlaylistPicker } from "./GameLobby";

const own: PlaylistResult[] = [{ id: "mine", name: "Roadtrip", image: null, owner: "Max", trackCount: 84 }];
const found: PlaylistResult[] = [{ id: "pl90", name: "Hits der 90er", image: null, owner: "Spotify", trackCount: 120 }];
const game: Game = addPlayer(newGame("g1", 0), { id: "h", name: "H", joinedAt: 0 })!;

function setup() {
  const loaded: Game = { ...game, settings: { ...game.settings, playlistId: "pl90" }, playlistTrackCount: 21, playlistInfo: { name: "Hits der 90er", image: null } };
  const api = {
    searchPlaylists: vi.fn(async (q: string) => (q ? found : own)),
    loadPlaylist: vi.fn(async () => ({ game: loaded })),
  };
  const applyGame = vi.fn();
  render(<PlaylistPicker game={game} controls={{ api: api as unknown as GameApi, act: async () => {}, applyGame }} />);
  return { api, applyGame, loaded };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("PlaylistPicker", () => {
  it("suggests popular playlists first; the host's own ones only when unfolded", async () => {
    const { api } = setup();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(api.searchPlaylists).toHaveBeenCalledWith("Die größten Hits aller Zeiten");
    expect(api.searchPlaylists).not.toHaveBeenCalledWith("");
    expect(screen.getByText("Beliebt")).toBeTruthy();
    expect(screen.queryByText("Roadtrip")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Eigene Playlists/ }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(api.searchPlaylists).toHaveBeenCalledWith("");
    expect(screen.getByText("Roadtrip")).toBeTruthy();
  });

  it("starts from a decade or genre right away", async () => {
    const { api } = setup();
    fireEvent.click(screen.getByRole("button", { name: "90er" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(api.searchPlaylists).toHaveBeenLastCalledWith("Hits der 90er");
    expect(screen.getByText("Beliebt: 90er")).toBeTruthy();
    expect((screen.getByLabelText("Playlist suchen") as HTMLInputElement).value).toBe("Hits der 90er");
  });

  it("searches after a short pause and loads the picked playlist", async () => {
    const { api, applyGame, loaded } = setup();
    fireEvent.change(screen.getByLabelText("Playlist suchen"), { target: { value: "90er" } });
    await act(() => vi.advanceTimersByTimeAsync(399));
    expect(api.searchPlaylists).not.toHaveBeenCalledWith("90er");
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(api.searchPlaylists).toHaveBeenCalledWith("90er");
    expect(screen.getByText("Treffer")).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByText("Hits der 90er")); });
    expect(api.loadPlaylist).toHaveBeenCalledWith("pl90");
    expect(applyGame).toHaveBeenCalledWith(loaded);
  });

  it("says so when nothing was found", async () => {
    const { api } = setup();
    api.searchPlaylists.mockImplementation(async () => []);
    fireEvent.change(screen.getByLabelText("Playlist suchen"), { target: { value: "gibtsnicht" } });
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(screen.getByText("Keine Playlist gefunden.")).toBeTruthy();
  });
});
