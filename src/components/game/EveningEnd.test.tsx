// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { addPlayer, newGame } from "@/lib/game/reducer";
import type { EveningGame, Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { EveningEnd, mostWins, TvEveningEnd } from "./EveningEnd";

const played = (mode: EveningGame["mode"], ranking: [string, number][], team?: boolean, name?: string): EveningGame =>
  ({ mode, ...(name ? { name } : {}), songs: 10, ranking: ranking.map(([name, score]) => ({ name, score })), ...(team === undefined ? {} : { team: { won: team } }) });

const GAMES = [
  played("buzzer", [["Lea", 7], ["Tom", 5], ["Max", 3], ["Sophie", 1]], undefined, "Buzzer · Reihum"),
  played("year", [["Max", 18], ["Lea", 15], ["Sophie", 9]]),
  played("choice", [["Lea", 21], ["Tom", 17], ["Max", 12]], undefined, "Vier Antworten · Interpret"),
];

function closed(games = GAMES, savedPlaylist?: Game["savedPlaylist"]): Game {
  let g = newGame("g1", 0);
  for (const [i, name] of ["Max", "Lea", "Tom", "Sophie"].entries()) g = addPlayer(g, { id: name.toLowerCase(), name, joinedAt: i })!;
  const songs = Array.from({ length: 47 }, (_, i) => ({ trackId: `t${i}`, name: `Song ${i}`, artist: "Band", albumArt: null }));
  return { ...g, closedAt: 1, evening: { games, songs }, savedPlaylist };
}

const controls = { api: { savePlaylist: async () => ({}) }, act: async () => {}, applyGame: () => {} } as unknown as GameControls;

afterEach(cleanup);

describe("Who won the most games", () => {
  it("counts wins, shares ties, leaves out team games and games nobody scored in", () => {
    expect(mostWins(GAMES)).toEqual({ names: ["Lea"], wins: 2 });
    expect(mostWins([GAMES[0], GAMES[1]])).toEqual({ names: ["Lea", "Max"], wins: 1 });
    expect(mostWins([played("timeline", [["Max", 5]], true), played("year", [["Max", 0], ["Lea", 0]])])).toBeNull();
  });
});

describe("The evening's summary after the lobby closed", () => {
  it("shows every game with its result and who won the most", () => {
    render(<EveningEnd game={closed()} myId="lea" />);
    expect(screen.getByRole("heading", { name: "Das war's!" })).toBeTruthy();
    expect(screen.getByText("3 Spiele · 47 Songs · 4 Spieler")).toBeTruthy();
    expect(screen.getByText("Lea · 2 von 3 Spielen")).toBeTruthy();
    const games = screen.getAllByRole("listitem").filter(li => li.querySelector("strong")?.textContent?.match(/Buzzer|schätzen|Antworten/));
    // With the variant played; games from before variants (no name kept) by their mode
    expect(games.map(g => g.querySelector("strong")!.textContent)).toEqual(["Buzzer · Reihum", "Jahr schätzen", "Vier Antworten · Interpret"]);
    expect(within(games[0]).getByText("Lea")).toBeTruthy();
    expect(within(games[0]).queryByText("Sophie")).toBeNull(); // the first three
  });

  it("ties and team games", () => {
    render(<EveningEnd game={closed([GAMES[0], GAMES[1], played("timeline", [["Max", 4], ["Lea", 4]], false)])} />);
    expect(screen.getByText("Lea und Max · je 1 von 3 Spielen")).toBeTruthy();
    expect(screen.getByText("Gemeinsam verloren")).toBeTruthy();
  });

  it("the host can still save the songs, the others get the link", () => {
    render(<EveningEnd game={closed()} myId="max" controls={controls} />);
    expect(screen.getByRole("button", { name: /Als Spotify-Playlist speichern/ })).toBeTruthy();
    cleanup();
    render(<EveningEnd game={closed()} myId="lea" controls={controls} />);
    expect(screen.getByText(/Max kann sie noch als Spotify-Playlist speichern/)).toBeTruthy();
    cleanup();
    render(<EveningEnd game={closed(GAMES, { url: "https://open.spotify.com/playlist/p1", songs: 47 })} />);
    expect(screen.getByRole("link", { name: "In Spotify öffnen" })).toBeTruthy();
  });

  it("on the TV: the games side by side and whether the songs were saved", () => {
    render(<TvEveningEnd game={closed(GAMES, { url: "#", songs: 47 })} />);
    expect(screen.getByText("Lea · 2 von 3 Spielen")).toBeTruthy();
    expect(screen.getByText("Max hat sie als Playlist gespeichert")).toBeTruthy();
  });
});
