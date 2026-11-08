// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameApi, type GameApi, type PlaylistResult } from "@/lib/game/client";
import { addPlayer, newGame } from "@/lib/game/reducer";
import type { Game } from "@/lib/game/types";
import { PlaylistPicker } from "./GameLobby";

const own: PlaylistResult[] = [{ id: "mine", name: "Roadtrip", image: null, owner: "Max", trackCount: 84 }];
const found: PlaylistResult[] = [{ id: "pl90", name: "Hits der 90er", image: null, owner: "Spotify", trackCount: 120 }];
const game: Game = addPlayer(newGame("g1", 0), { id: "h", name: "H", joinedAt: 0 })!;

function setup() {
  const loaded: Game = { ...game, settings: { ...game.settings, playlistId: "pl90" }, playlistTrackCount: 21, playlistInfo: { name: "Hits der 90er", image: null } };
  const api = {
    searchPlaylists: vi.fn<(q: string, offset?: number) => Promise<PlaylistResult[]>>(async q => (q ? found : own)),
    loadPlaylist: vi.fn(async () => ({ game: loaded })),
  };
  const applyGame = vi.fn();
  const onPicked = vi.fn();
  render(<PlaylistPicker game={game} controls={{ api: api as unknown as GameApi, act: async () => {}, applyGame }} onPicked={onPicked} />);
  return { api, applyGame, loaded, onPicked };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("PlaylistPicker", () => {
  it("suggests mixed playlists like Hitster first; the host's own ones only when unfolded", async () => {
    const { api } = setup();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(api.searchPlaylists).toHaveBeenCalledWith("Hitster");
    expect(api.searchPlaylists).not.toHaveBeenCalledWith("");
    expect(screen.getByText("Beliebt: Hitster")).toBeTruthy();
    expect(screen.getAllByRole("group")[0].getAttribute("aria-label")).toBe("Querbeet");
    expect(screen.queryByText("Roadtrip")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Eigene Playlists/ }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(api.searchPlaylists).toHaveBeenCalledWith("");
    expect(screen.getByText("Roadtrip")).toBeTruthy();
  });

  it("playlists with few songs come after the bigger ones", async () => {
    const { api } = setup();
    api.searchPlaylists.mockImplementation(async () => [
      { id: "small", name: "Kleine Liste", image: null, owner: "X", trackCount: 12 },
      { id: "big", name: "Große Liste", image: null, owner: "Y", trackCount: 300 },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Alle Jahrzehnte" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getAllByText(/Liste$/).map(el => el.textContent)).toEqual(["Große Liste", "Kleine Liste"]);
  });

  it("loads more playlists on request, until there are no more", async () => {
    const many = (from: number, n: number): PlaylistResult[] =>
      Array.from({ length: n }, (_, i) => ({ id: `p${from + i}`, name: `Mix ${from + i}`, image: null, owner: "Spotify", trackCount: 50 }));
    const { api } = setup();
    api.searchPlaylists.mockImplementation(async (_q: string, offset = 0) => (offset ? many(10, 3) : many(0, 10)));
    fireEvent.click(screen.getByRole("button", { name: "Rock" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getAllByText(/^Mix \d+$/)).toHaveLength(10);

    fireEvent.click(screen.getByRole("button", { name: "Mehr Playlists" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(api.searchPlaylists).toHaveBeenLastCalledWith("Rock Klassiker", 10);
    expect(screen.getAllByText(/^Mix \d+$/)).toHaveLength(13);
    expect(screen.queryByRole("button", { name: "Mehr Playlists" })).toBeNull();
  });

  it("starts from a decade or genre right away", async () => {
    const { api } = setup();
    fireEvent.click(screen.getByRole("button", { name: "90er" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(api.searchPlaylists).toHaveBeenLastCalledWith("Hits der 90er");
    expect(screen.getByText("Beliebt: 90er")).toBeTruthy();
    expect((screen.getByLabelText("Playlist suchen") as HTMLInputElement).value).toBe("Hits der 90er");
  });

  it("searches after a short pause, loads the picked playlist and closes", async () => {
    const { api, applyGame, loaded, onPicked } = setup();
    fireEvent.change(screen.getByLabelText("Playlist suchen"), { target: { value: "90er" } });
    await act(() => vi.advanceTimersByTimeAsync(399));
    expect(api.searchPlaylists).not.toHaveBeenCalledWith("90er");
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(api.searchPlaylists).toHaveBeenCalledWith("90er");
    expect(screen.getByText("Treffer")).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByText("Hits der 90er")); });
    expect(api.loadPlaylist).toHaveBeenCalledWith("pl90", 120);
    expect(applyGame).toHaveBeenCalledWith(loaded);
    expect(onPicked).toHaveBeenCalledOnce();
  });

  it("stays open with the error when the playlist can't be loaded", async () => {
    const { api, onPicked } = setup();
    api.loadPlaylist.mockResolvedValue({ error: "Playlist ist leer" } as never);
    fireEvent.click(screen.getByRole("button", { name: "90er" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(async () => { fireEvent.click(screen.getByText("Hits der 90er")); });
    expect(screen.getByText("Playlist ist leer")).toBeTruthy();
    expect(onPicked).not.toHaveBeenCalled();
  });

  it("says so when the connection drops while loading the playlist", async () => {
    const { api, onPicked } = setup();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    api.loadPlaylist.mockImplementation(gameApi("g1", "token").loadPlaylist as never);
    fireEvent.click(screen.getByRole("button", { name: "90er" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(async () => { fireEvent.click(screen.getByText("Hits der 90er")); });
    expect(screen.getByText("Verbindung fehlgeschlagen")).toBeTruthy();
    expect(onPicked).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("says so when nothing was found", async () => {
    const { api } = setup();
    api.searchPlaylists.mockImplementation(async () => []);
    fireEvent.change(screen.getByLabelText("Playlist suchen"), { target: { value: "gibtsnicht" } });
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(screen.getByText("Keine Playlist gefunden.")).toBeTruthy();
  });
});
