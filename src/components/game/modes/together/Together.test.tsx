import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameView } from "../../GameView";
import { BigScreen, BigTimeline } from "./BigScreen";
import { Watch } from "./Watch";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game, Track } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import type { GameApi } from "@/lib/game/client";

const track = (id: string, name: string, y: number): Track => ({ id, name, artist: `Artist ${id}`, releaseYear: String(y), albumArt: null, previewUrl: null });
const playlist = [track("s1", "Start Eins", 1970), track("p1", "Secret Song", 1987)];
const controls: GameControls = { api: {} as GameApi, act: async () => {}, applyGame: () => {} };

function play(...steps: [string, Action][]): Game {
  let game = newGame("g1", 0);
  for (const [i, id] of ["h", "a"].entries()) game = addPlayer(game, { id, name: id.toUpperCase(), joinedAt: i })!;
  for (const [actor, action] of [["h", { type: "setMode", mode: "together" }], ["h", { type: "start" }], ...steps] as [string, Action][]) {
    const r = applyAction(game, actor, action, { now: Date.now(), random: () => 0, playlist });
    if (!r.ok) throw new Error(r.error);
    game = r.game;
  }
  return game;
}

const render = (game: Game, myId: string) =>
  renderToStaticMarkup(<GameView game={game} controls={controls} myId={myId} playback={null} notice={null} />).replaceAll("&#x27;", "'");
const tv = (game: Game) => [<BigScreen key="a" game={game} playback={null} />, <BigTimeline key="b" game={game} playback={null} />, <Watch key="c" game={game} playback={null} />]
  .map(el => renderToStaticMarkup(el)).join("");

describe("Zeitstrahl für alle UI", () => {
  it("the lobby offers the mode as a variant of the timeline", () => {
    const game = addPlayer(newGame("g1", 0), { id: "h", name: "H", joinedAt: 0 })!;
    expect(render(game, "h")).toContain("Jeder für sich · Im Team · Alle gleichzeitig");
  });

  it("everyone places in the shared timeline; nobody else sees where", () => {
    const game = play(["a", { type: "pick", index: 1, done: true }]);
    const mine = render(game, "h");
    expect(mine).toContain("Wann kam dieser Song raus?");
    expect(mine).toContain("1970");
    expect(mine).toContain("Fertig");
    for (const html of [mine, tv(game)]) {
      expect(html).not.toContain("Secret Song");
      expect(html).not.toContain("Vorschlag von A"); // A's gap stays hidden
    }
    expect(tv(game)).toContain("Fertig: 1 von 2");
  });

  it("after the reveal: being right means being on the card, a wrong tip stays in its gap – on the TV too", () => {
    const game = play(["a", { type: "pick", index: 1, done: true }], ["h", { type: "pick", index: 0, done: true }]);
    const theirs = render(game, "a");
    expect(theirs).toContain("Richtig gelegt!");
    expect(theirs).toContain("1987: Secret Song – richtig: A"); // A sits on the new card …
    expect(theirs).toMatch(/Dein Tipp/);
    const mine = render(game, "h");
    expect(mine).toContain("Daneben");
    expect(mine).toContain("Er gehört nach 1970.");
    expect(mine).toContain("Daneben: dein Tipp"); // … H's wrong gap is marked as H's own
    const screen = tv(game);
    expect(screen).toContain("Secret Song");
    expect(screen).toContain("richtig: A");
    expect(screen).toContain("Daneben: H");
  });

  it("with equal years, tips on both sides of the twin card count as right on the card", () => {
    playlist.splice(0, 1, track("s1", "Start Eins", 1987));
    try {
      const game = play(["a", { type: "pick", index: 0, done: true }], ["h", { type: "pick", index: 1, done: true }]);
      for (const id of ["a", "h"]) {
        const html = render(game, id);
        expect(html).toContain("Richtig gelegt!");
        expect(html).toContain("1987: Secret Song – richtig: A, H");
        expect(html).not.toContain("Daneben");
      }
    } finally {
      playlist.splice(0, 1, track("s1", "Start Eins", 1970));
    }
  });
});
