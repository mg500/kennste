import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameView } from "../../GameView";
import { BigScreen } from "./BigScreen";
import { Watch } from "./Watch";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game, Track } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import type { GameApi } from "@/lib/game/client";

const playlist: Track[] = [{ id: "p1", name: "Secret Song", artist: "Secret Artist", releaseYear: "1987", albumArt: null, previewUrl: null }];
const controls: GameControls = { api: {} as GameApi, act: async () => {}, applyGame: () => {} };

function play(...steps: [string, Action][]): Game {
  let game = newGame("g1", 0);
  for (const [i, id] of ["h", "a"].entries()) game = addPlayer(game, { id, name: id.toUpperCase(), joinedAt: i })!;
  for (const [actor, action] of [["h", { type: "setMode", mode: "year" }], ["h", { type: "start" }], ...steps] as [string, Action][]) {
    const r = applyAction(game, actor, action, { now: Date.now(), random: () => 0, playlist });
    if (!r.ok) throw new Error(r.error);
    game = r.game;
  }
  return game;
}

const render = (game: Game, myId: string) =>
  renderToStaticMarkup(<GameView game={game} controls={controls} myId={myId} playback={null} notice={null} />).replaceAll("&#x27;", "'");

describe("Jahr schätzen UI", () => {
  it("lobby offers the mode", () => {
    let game = newGame("g1", 0);
    game = addPlayer(game, { id: "h", name: "H", joinedAt: 0 })!;
    expect(render(game, "h")).toContain("Jahr schätzen");
  });

  it("everyone picks a year; the host can reveal early", () => {
    const game = play();
    for (const id of ["h", "a"]) {
      const html = render(game, id);
      expect(html).toContain("Aus welchem Jahr ist der Song?");
      expect(html).toContain("Fertig");
    }
    expect(render(game, "h")).toContain("Jetzt auflösen");
    expect(render(game, "a")).not.toContain("Jetzt auflösen");
  });

  it("after guessing: own guess, who has guessed, nothing revealed", () => {
    const game = play(["a", { type: "guess", year: 1984 }]);
    const html = render(game, "a");
    expect(html).toContain("1984");
    expect(html).toContain("Getippt: 1 von 2");
    const screens = [<BigScreen key="tv" game={game} playback={null} />, <Watch key="phone" game={game} playback={null} />].map(el => renderToStaticMarkup(el));
    for (const h of [render(game, "h"), ...screens]) {
      expect(h).not.toContain("Secret Song");
      expect(h).not.toContain("1987");
      expect(h).not.toContain("1984"); // others' guesses stay hidden in the UI
    }
  });

  it("reveal: year, points and who continues", () => {
    const game = play(["a", { type: "guess", year: 1985 }], ["h", { type: "guess", year: 1987 }]);
    const mine = render(game, "a");
    expect(mine).toContain("Secret Song");
    expect(mine).toContain("+2");
    expect(mine).toContain("2 Jahre daneben");
    expect(mine).toContain("H</strong> macht weiter");
    expect(render(game, "h")).toContain("exakt getroffen");
    expect(render(game, "h")).toContain("Nächster Song");
    const tv = renderToStaticMarkup(<BigScreen game={game} playback={null} />);
    expect(tv).toContain("1987");
    // Everyone's guess with the points, on the TV in the player cards
    expect(tv).toMatch(/A<\/span><span[^>]*>1985 · 2 J\./);
    expect(tv).toContain("1987 · exakt");
    expect(tv).toContain("+3");
    expect(tv).not.toContain("Punktestand"); // no extra column, the cards show the score
  });

  it("the TV's countdown keeps its width, so the question next to it doesn't move", () => {
    const game = play();
    const data = structuredClone(game.mode) as { round: { playingAt?: number } };
    data.round.playingAt = Date.now() - 25_500; // 5 of 30 seconds left
    const html = renderToStaticMarkup(<BigScreen game={{ ...game, mode: data } as Game} playback={null} />);
    expect(html).toMatch(/min-width:2ch[^>]*>5</);
  });
});
