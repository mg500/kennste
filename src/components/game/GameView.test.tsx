import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameView } from "./GameView";
import { BigScreen } from "./modes/buzzer/BigScreen";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game, Track } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import type { GameApi } from "@/lib/game/client";

const track: Track = { id: "t1", name: "Bohemian Rhapsody", artist: "Queen", releaseYear: "1975", albumArt: "https://img/cover.jpg", previewUrl: null };
const controls: GameControls = { api: {} as GameApi, act: async () => {}, applyGame: () => {} };

function play(...steps: [string, Action][]): Game {
  let game = newGame("g1", 0);
  for (const [i, id] of ["h", "a", "b"].entries()) game = addPlayer(game, { id, name: id.toUpperCase(), joinedAt: i })!;
  for (const [actor, action] of steps) {
    const r = applyAction(game, actor, action, { now: Date.now(), random: () => 0 });
    if (!r.ok) throw new Error(r.error);
    game = r.game;
  }
  return game;
}

/** Rendered text with HTML entities decoded. */
const render = (game: Game, myId: string) =>
  renderToStaticMarkup(<GameView game={game} controls={controls} myId={myId} playback={null} notice={null} />)
    .replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

const started: [string, Action][] = [["h", { type: "start" }]];
const playing: [string, Action][] = [...started, ["h", { type: "pickSong", track }]];
const buzzed: [string, Action][] = [...playing, ["a", { type: "buzz" }]];
const revealed: [string, Action][] = [...buzzed, ["h", { type: "judge", verdict: "correct" }]];

describe("GameView", () => {
  it("lobby: host can start, others wait", () => {
    const game = play();
    expect(render(game, "h")).toContain("Spiel starten");
    expect(render(game, "h")).toContain("Anpassen");
    expect(render(game, "a")).not.toContain("Spiel starten");
    expect(render(game, "a")).toContain("Warte auf H");
  });

  it("lobby: offers the TV view and shows when one is connected", () => {
    const game = play();
    expect(render(game, "a")).toContain("/game/g1/screen");
    expect(render(game, "h")).not.toContain("TV-Ansicht verbunden");
    expect(render({ ...game, connectedScreens: 1 }, "h")).toContain("TV-Ansicht verbunden");
  });

  it("lobby: host sees which device the music plays on", () => {
    const game = play();
    expect(render(game, "h")).toContain("Aktives Spotify-Gerät");
    expect(render({ ...game, device: { id: "d1", name: "Wohnzimmer", type: "Speaker" } }, "h")).toContain("Wohnzimmer");
    expect(render(game, "a")).not.toContain("Musik läuft auf");
  });

  it("picking: active player searches, others can queue", () => {
    const game = play(...started);
    expect(render(game, "h")).toContain("Du legst auf");
    expect(render(game, "h")).toContain("Song suchen…");
    expect(render(game, "a")).toContain("H sucht einen Song");
    expect(render(game, "a")).toContain("Song vormerken…");
  });

  it("playing: active player sees the song and hints, guessers get the buzzer", () => {
    const game = play(...playing);
    const active = render(game, "h");
    expect(active).toContain("Bohemian Rhapsody");
    expect(active).toContain("Tipp geben");
    expect(active).toContain("Interpret"); // enabled hint
    expect(active).not.toContain(">Titel<"); // title hint disabled by default

    const guesser = render(game, "a");
    expect(guesser).toContain("Erkennst du Hs Song?");
    expect(guesser).toContain("BUZZ");
  });

  it("never sends unrevealed answers to guessers or the big screen", () => {
    const game = play(...playing);
    const screen = renderToStaticMarkup(<BigScreen game={game} playback={null} />);
    for (const html of [render(game, "a"), screen]) {
      expect(html).not.toContain("Bohemian Rhapsody");
      expect(html).not.toContain("Queen");
      expect(html).not.toContain("1975");
    }
    const hinted = play(...playing, ["h", { type: "hint", field: "artist" }]);
    expect(render(hinted, "a")).toContain("Queen");
    expect(render(hinted, "a")).not.toContain("Bohemian Rhapsody");
  });

  it("buzzed: active player judges, buzzer answers, others wait", () => {
    const game = play(...buzzed);
    expect(render(game, "h")).toContain("Richtig");
    expect(render(game, "h")).toContain("A hat gebuzzert!");
    expect(render(game, "a")).toContain("Du bist dran!");
    expect(render(game, "b")).toContain("H entscheidet");
  });

  it("revealed: shows who scored, only the next player continues", () => {
    const game = play(...revealed);
    const others = render(game, "b");
    expect(others).toContain("A hat's erraten!");
    expect(others).toContain("Bohemian Rhapsody");
    expect(others).toContain("Warte auf A");
    const next = render(game, "a");
    expect(next).toContain("Du hast's erraten!");
    expect(next).toContain(">Weiter");
    expect(next).toContain("Als Nächstes legt <strong");
    expect(render(game, "h")).not.toContain(">Weiter");
    expect(render(game, "h")).toContain("Warte auf A");
  });

  it("viewers watch without buzzer", () => {
    const game = play(["h", { type: "toggleViewer", playerId: "b" }], ...playing);
    const html = render(game, "b");
    expect(html).toContain("Du schaust zu");
    expect(html).not.toContain("BUZZ");
  });

  it("finished: shows the winner, host can start a new game", () => {
    const game = play(["h", { type: "updateSettings", patch: { goal: "score", targetScore: 1 } }], ...revealed, ["h", { type: "next" }]);
    expect(game.status).toBe("finished");
    expect(render(game, "h")).toContain("Neues Spiel");
    expect(render(game, "h")).toContain("A gewinnt!");
    expect(render(game, "a")).toContain("Du gewinnst!");
    expect(render(game, "a")).toContain("Bohemian Rhapsody – Queen"); // guessed songs
    expect(render(game, "a")).not.toContain("Neues Spiel");
  });
});
