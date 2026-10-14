import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameView } from "./GameView";
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

const render = (game: Game, myId: string) =>
  renderToStaticMarkup(<GameView game={game} controls={controls} myId={myId} playback={null} notice={null} />);

describe("GameView", () => {
  it("lobby: host sees start button, others wait", () => {
    const game = play();
    expect(render(game, "h")).toContain("Starten");
    expect(render(game, "a")).not.toContain("Starten");
    expect(render(game, "a")).toContain("Warte auf den Spielleiter");
  });

  it("picking: picker searches, others can queue", () => {
    const game = play(["h", { type: "start" }]);
    expect(render(game, "h")).toContain("Wähle einen Song");
    expect(render(game, "h")).toContain("Song suchen…");
    expect(render(game, "a")).toContain("H wählt einen Song");
    expect(render(game, "a")).toContain("Song zur Warteschlange hinzufügen…");
  });

  it("playing: picker sees the song, guessers see it blurred with a buzzer", () => {
    const game = play(["h", { type: "start" }], ["h", { type: "pickSong", track }]);
    const picker = render(game, "h");
    expect(picker).toContain("Dein Song wird gespielt");
    expect(picker).toContain("Bohemian Rhapsody");
    expect(picker).toContain("Interpret"); // hint button
    expect(picker).not.toContain(">Titel<"); // title hint disabled by default

    const guesser = render(game, "a");
    expect(guesser).toContain("Erkennst du Hs Song?");
    expect(guesser).toContain("Buzz");
    expect(guesser).toContain("blur(12px)");
  });

  it("buzzed: picker judges, buzzer waits", () => {
    const game = play(["h", { type: "start" }], ["h", { type: "pickSong", track }], ["a", { type: "buzz" }]);
    expect(render(game, "h")).toContain("Richtig");
    expect(render(game, "h")).toContain("A hat gebuzzert!");
    expect(render(game, "a")).toContain("Du hast gebuzzert!");
    expect(render(game, "b")).toContain("Warte auf Auflösung");
  });

  it("after a round: shows result and the previous song", () => {
    const game = play(["h", { type: "start" }], ["h", { type: "pickSong", track }], ["a", { type: "buzz" }], ["h", { type: "judge", verdict: "correct" }]);
    const html = render(game, "b");
    expect(html).toContain("A hat es erraten!");
    expect(html).toContain("Bohemian Rhapsody");
    expect(html).toContain("A wählt einen Song");
  });

  it("viewers watch without buzzer", () => {
    const game = play(["h", { type: "toggleViewer", playerId: "b" }], ["h", { type: "start" }], ["h", { type: "pickSong", track }]);
    const html = render(game, "b");
    expect(html).toContain("Zuschauer");
    expect(html).not.toContain(">Buzz<");
  });

  it("finished: host can start a new game", () => {
    const game = play(["h", { type: "updateSettings", patch: { gameMode: "bestOf", bestOf: 1 } }], ["h", { type: "start" }],
      ["h", { type: "pickSong", track }], ["a", { type: "buzz" }], ["h", { type: "judge", verdict: "correct" }]);
    expect(game.status).toBe("finished");
    expect(render(game, "h")).toContain("Neues Spiel");
    expect(render(game, "a")).not.toContain("Neues Spiel");
  });
});
