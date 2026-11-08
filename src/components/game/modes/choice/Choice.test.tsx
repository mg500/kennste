import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameView } from "../../GameView";
import { BigScreen } from "./BigScreen";
import { Watch } from "./Watch";
import { choiceData } from "@/lib/game/modes/choice";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game, Track } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import type { GameApi } from "@/lib/game/client";

const t = (id: string, name: string, artist: string): Track => ({ id, name, artist, releaseYear: "1987", albumArt: null, previewUrl: null });
const playlist = [t("p1", "Never Gonna Give You Up", "Rick Astley"), t("p2", "Take On Me", "a-ha"), t("p3", "Africa", "Toto"), t("p4", "Faith", "George Michael")];
const controls: GameControls = { api: {} as GameApi, act: async () => {}, applyGame: () => {} };

function play(...steps: [string, Action | ((g: Game) => Action)][]): Game {
  let game = newGame("g1", 0);
  for (const [i, id] of ["h", "a"].entries()) game = addPlayer(game, { id, name: id.toUpperCase(), joinedAt: i })!;
  for (const [actor, step] of [["h", { type: "setMode", mode: "choice" }], ["h", { type: "start" }], ...steps] as [string, Action | ((g: Game) => Action)][]) {
    const action = typeof step === "function" ? step(game) : step;
    const r = applyAction(game, actor, action, { now: Date.now(), random: () => 0, playlist });
    if (!r.ok) throw new Error(r.error);
    game = r.game;
  }
  return game;
}
const right = (g: Game): Action => ({ type: "answer", option: choiceData(g).round!.options.indexOf("Never Gonna Give You Up") });
const wrong = (g: Game): Action => ({ type: "answer", option: (choiceData(g).round!.options.indexOf("Never Gonna Give You Up") + 1) % 4 });

const render = (game: Game, myId: string) =>
  renderToStaticMarkup(<GameView game={game} controls={controls} myId={myId} playback={null} notice={null} />).replaceAll("&#x27;", "'");

describe("Song-Tipp UI", () => {
  it("the host can seek in the song, like they can pause it; the others only see where it is", () => {
    const game = play();
    const trackId = choiceData(game).round!.trackId;
    const playback = { data: { trackId, isPlaying: true, progressMs: 30_000, durationMs: 200_000 }, receivedAt: Date.now() };
    const seen = (myId: string) => renderToStaticMarkup(<GameView game={game} controls={controls} myId={myId} playback={playback} notice={null} />);
    expect(seen("h")).toContain('role="slider"');
    expect(seen("a")).not.toContain('role="slider"');
  });

  it("everyone sees the question and four options to pick", () => {
    const game = play();
    for (const id of ["h", "a"]) {
      const html = render(game, id);
      expect(html).toContain("Welcher Song läuft?");
      expect(html).toContain("Take On Me");
      expect(html.match(/aria-pressed/g)?.length).toBe(4);
    }
    expect(render(game, "h")).toContain("Jetzt auflösen");
  });

  it("after answering: no more buttons, nothing revealed anywhere", () => {
    const game = play(["a", wrong]);
    expect(render(game, "a")).not.toContain("aria-pressed");
    expect(render(game, "a")).toContain("Getippt: 1 von 2");
    const screens = [<BigScreen key="tv" game={game} playback={null} />, <Watch key="phone" game={game} playback={null} />].map(el => renderToStaticMarkup(el));
    for (const html of [render(game, "h"), render(game, "a"), ...screens]) {
      expect(html).not.toContain("Richtig");
      expect(html).not.toContain("Rick Astley");
    }
  });

  it("reveal: right answer, points and bonus", () => {
    const game = play(["a", right], ["h", wrong]);
    const mine = render(game, "a");
    expect(mine).toContain("Richtig – und am schnellsten!");
    expect(mine).toContain("+3");
    expect(mine).toContain("Rick Astley · 1987");
    expect(render(game, "h")).toContain("Leider daneben");
    expect(render(game, "h")).toContain("Nächster Song");
    expect(renderToStaticMarkup(<BigScreen game={game} playback={null} />)).toContain("A war am schnellsten");
  });

  it("reveal on the TV: everyone's answer with points, also who didn't answer", () => {
    const game = play(["a", right], ["h", { type: "reveal" }]);
    const tv = renderToStaticMarkup(<BigScreen game={game} playback={null} />);
    const option = choiceData(game).round!.answers.a.option + 1;
    expect(tv).toMatch(new RegExp(`A</span><span[^>]*>Antwort ${option}<`)); // which answer they picked, in the player cards
    expect(tv).toMatch(/\+3<\/span><span[^>]*>3</); // the points of the round and the total
    expect(tv).toMatch(/H<\/span><span[^>]*>keine Antwort/);
  });
});
