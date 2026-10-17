import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameView } from "../../GameView";
import { BigScreen } from "./BigScreen";
import { Watch } from "./Watch";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game, Track } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import type { GameApi } from "@/lib/game/client";

const playlist: Track[] = [{ id: "p1", name: "Secret Song", artist: "Secret Artist", releaseYear: "1984", albumArt: null, previewUrl: null }];
const controls: GameControls = { api: { answer: async () => null } as unknown as GameApi, act: async () => {}, applyGame: () => {} };

function play(...steps: [string, Action][]): Game {
  let game = newGame("g1", 0);
  for (const [i, id] of ["h", "a", "b"].entries()) game = addPlayer(game, { id, name: id.toUpperCase(), joinedAt: i })!;
  for (const [actor, action] of [["h", { type: "setMode", mode: "versus" }], ["h", { type: "start" }], ...steps] as [string, Action][]) {
    const r = applyAction(game, actor, action, { now: Date.now(), random: () => 0, playlist });
    if (!r.ok) throw new Error(r.error);
    game = r.game;
  }
  return game;
}

const decode = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&quot;", "\"");
const render = (game: Game, myId: string) => decode(renderToStaticMarkup(<GameView game={game} controls={controls} myId={myId} playback={null} notice={null} />));
const tv = (game: Game) => decode([<BigScreen key="a" game={game} playback={null} />, <Watch key="b" game={game} playback={null} />].map(el => renderToStaticMarkup(el)).join(""));

describe("Alle gegen alle UI", () => {
  it("the lobby offers the mode", () => {
    const game = addPlayer(newGame("g1", 0), { id: "h", name: "H", joinedAt: 0 })!;
    expect(render(game, "h")).toContain("Alle gegen alle");
  });

  it("everyone may buzz, the host too; nobody sees the song", () => {
    const game = play();
    for (const id of ["h", "a"]) {
      expect(render(game, id)).toContain("BUZZ");
      expect(render(game, id)).not.toContain("Secret Song");
    }
    expect(tv(game)).toContain("Wer erkennt ihn zuerst?");
    expect(tv(game)).not.toContain("Secret Song");
  });

  it("after a buzz: the buzzer judges, the others wait – the song still hidden from them", () => {
    const game = play(["a", { type: "buzz" }]);
    const buzzer = render(game, "a");
    expect(buzzer).toContain("Du bist dran!");
    expect(buzzer).toContain("Nur du siehst die Lösung");
    expect(buzzer).toContain("Richtig");
    const other = render(game, "b");
    expect(other).toContain("A hat gebuzzert!");
    expect(other).not.toContain("Richtig");
    expect(tv(game)).toContain("A hat gebuzzert!");
    expect(tv(game)).toMatch(/A.*buzzert/);
  });

  it("\"right\": the others see the song and may object, the TV shows the objections", () => {
    const game = play(["a", { type: "buzz" }], ["a", { type: "judge", verdict: "correct" }], ["b", { type: "object", want: true }]);
    const other = render(game, "h");
    expect(other).toContain("A sagt: richtig!");
    expect(other).toContain("Secret Song");
    expect(other).toContain("Einspruch – das war falsch");
    expect(render(game, "b")).toContain("Einspruch zurücknehmen");
    expect(render(game, "a")).toContain("Die anderen prüfen …");
    expect(tv(game)).toMatch(/Einspruch: <strong[^>]*>1<\/strong> von 2 nötig/);
  });

  it("overruled: no point for anybody", () => {
    const game = play(["a", { type: "buzz" }], ["a", { type: "judge", verdict: "correct" }], ["b", { type: "object", want: true }], ["h", { type: "object", want: true }]);
    expect(render(game, "a")).toContain("Einspruch – kein Punkt");
    expect(tv(game)).toContain("Einspruch – kein Punkt");
    expect(render(game, "h")).toContain("Nächster Song");
  });
});
