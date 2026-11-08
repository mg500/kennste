// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addPlayer, newGame } from "@/lib/game/reducer";
import type { EveningSong, Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { EveningSongs } from "./EveningSongs";

const song = (n: number): EveningSong => ({ trackId: `t${n}`, name: `Song ${n}`, artist: `Artist ${n}`, albumArt: null });

/** One game of the evening. */
const game = () => ({ mode: "year" as const, songs: 4, ranking: [{ name: "Max", score: 3 }] });

function lobby(songs: number, savedPlaylist?: Game["savedPlaylist"]): Game {
  let g = newGame("g1", 0);
  for (const [i, name] of ["Max", "Lea"].entries()) g = addPlayer(g, { id: name.toLowerCase(), name, joinedAt: i })!;
  return { ...g, evening: songs ? { games: [game(), game()], songs: Array.from({ length: songs }, (_, i) => song(i)) } : undefined, savedPlaylist };
}

function setup(game: Game, myId: string) {
  const savePlaylist = vi.fn(async (): Promise<{ url?: string; error?: string }> => ({ url: "https://open.spotify.com/playlist/p1" }));
  const controls = { api: { savePlaylist }, act: async () => {}, applyGame: () => {} } as unknown as GameControls;
  const view = render(<EveningSongs game={game} myId={myId} controls={controls} />);
  return { savePlaylist, rerender: (g: Game) => view.rerender(<EveningSongs game={g} myId={myId} controls={controls} />) };
}

const URL = "https://open.spotify.com/playlist/p1";

afterEach(cleanup);

describe("Songs of the evening in the lobby", () => {
  it("only once a game was played", () => {
    setup(lobby(0), "max");
    expect(screen.queryByText("Gespielte Songs")).toBeNull();
  });

  it("host: saves them, shows Spotify's error, then the link; songs of later games are added on a tap", async () => {
    const { savePlaylist, rerender } = setup(lobby(8), "max");
    expect(screen.getByText("2 Spiele · 8 Songs")).toBeTruthy();
    savePlaylist.mockResolvedValueOnce({ error: "Spotify erlaubt das Speichern noch nicht – melde dich einmal ab und wieder an" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Als Spotify-Playlist speichern/ })); });
    expect(screen.getByRole("alert").textContent).toContain("melde dich einmal ab und wieder an");

    rerender(lobby(8, { url: URL, songs: 8 }));
    expect(screen.getByRole("link", { name: /In Spotify öffnen/ }).getAttribute("href")).toBe(URL);
    expect(screen.queryByRole("button", { name: /hinzufügen/ })).toBeNull();

    rerender(lobby(20, { url: URL, songs: 8 })); // another game later
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "+12 neue hinzufügen" })); });
    expect(savePlaylist).toHaveBeenCalledTimes(2);
  });

  it("the others get the link once the host saved them", () => {
    const { rerender } = setup(lobby(8), "lea");
    expect(screen.getByText(/Max kann sie als Spotify-Playlist speichern/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /speichern/ })).toBeNull();
    rerender(lobby(8, { url: URL, songs: 8 }));
    expect(screen.getByText("Max hat sie als Playlist gespeichert")).toBeTruthy();
    expect(screen.getByRole("link", { name: "In Spotify öffnen" }).getAttribute("href")).toBe(URL);
  });

  it("shows every song on a tap", () => {
    setup(lobby(8), "lea");
    fireEvent.click(screen.getByRole("button", { name: "Alle 8 Songs ansehen" }));
    const list = within(screen.getByRole("dialog", { name: "Gespielte Songs" })).getByRole("list", { name: "Alle Songs" });
    expect(within(list).getAllByRole("link")).toHaveLength(8);
  });
});
