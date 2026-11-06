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

  it("after a buzz: the buzzer answers out loud without seeing anything, the others listen", () => {
    const game = play(["a", { type: "buzz" }]);
    const buzzer = render(game, "a");
    expect(buzzer).toContain("Du bist dran!");
    expect(buzzer).toContain("Gesagt – Lösung zeigen");
    expect(buzzer).not.toContain("Nur du siehst die Lösung");
    expect(buzzer).not.toContain("Richtig");
    const other = render(game, "b");
    expect(other).toContain("A hat gebuzzert!");
    expect(tv(game)).toContain("A hat gebuzzert!");
    expect(tv(game)).toMatch(/A.*buzzert/);
  });

  it("wrong: the buzzer is out for this song; \"Keine Ahnung\" keeps the buzzer", () => {
    const game = play(["a", { type: "buzz" }], ["a", { type: "answered" }], ["a", { type: "judge", verdict: "wrong" }], ["b", { type: "skip" }]);
    const buzzer = render(game, "a");
    expect(buzzer).toContain("bei diesem Song bist du raus");
    expect(buzzer).toMatch(/<button[^>]*disabled=""[^>]*>BUZZ/);
    expect(buzzer).not.toContain("Keine Ahnung");
    const skipped = render(game, "b");
    expect(skipped).toContain("Buzzern geht weiter");
    expect(skipped).not.toMatch(/<button[^>]*disabled=""[^>]*>BUZZ/);
  });

  it("answered: only the buzzer judges, the others see that they check – the song still hidden from them", () => {
    const game = play(["a", { type: "buzz" }], ["a", { type: "answered" }]);
    const buzzer = render(game, "a");
    expect(buzzer).toContain("Nur du siehst die Lösung");
    expect(buzzer).toContain("Richtig");
    expect(render(game, "b")).toContain("A prüft die Antwort");
    expect(render(game, "b")).not.toContain("Richtig");
    expect(tv(game)).toContain("A prüft die Antwort");
    expect(tv(game)).not.toContain("Secret Song");
  });

  it("\"right\": the others see the song and vote, the TV shows every vote", () => {
    const game = play(["a", { type: "buzz" }], ["a", { type: "answered" }], ["a", { type: "judge", verdict: "correct" }], ["b", { type: "vote", confirm: true }]);
    const host = render(game, "h");
    expect(host).toContain("A sagt: richtig!");
    expect(host).toContain("Secret Song");
    expect(host).toContain("Stimmt nicht");
    expect(host).toContain("Als Host:");
    expect(render(game, "b")).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Stimmt<kbd/);
    expect(render(game, "b")).not.toContain("Als Host:");
    expect(render(game, "a")).toContain("Die anderen stimmen ab");
    expect(tv(game)).toMatch(/Bestätigt: <strong[^>]*>1<\/strong> von 2/);
    expect(tv(game)).toMatch(/B<span[^>]*>· stimmt</);
    expect(tv(game)).toMatch(/H<span[^>]*>· offen/); // hasn't voted yet
  });

  it("not confirmed: no point for anybody, the TV still shows who voted how", () => {
    const game = play(["a", { type: "buzz" }], ["a", { type: "answered" }], ["a", { type: "judge", verdict: "correct" }],
      ["b", { type: "vote", confirm: false }]); // 1 of 2 against: the majority can't be reached anymore
    expect(render(game, "a")).toContain("Nicht bestätigt – kein Punkt");
    expect(tv(game)).toContain("Nicht bestätigt – kein Punkt");
    expect(tv(game)).toMatch(/B<span[^>]*>· stimmt nicht/);
    expect(render(game, "h")).toContain("Nächster Song");
  });

  it("the TV shows every player as a card with score and state instead of a standings column", () => {
    const listening = decode(renderToStaticMarkup(<BigScreen game={play()} playback={null} />));
    expect(listening).toMatch(/A<\/span><span[^>]*>hört zu/);
    const out = decode(renderToStaticMarkup(<BigScreen game={play(["a", { type: "buzz" }], ["a", { type: "answered" }], ["a", { type: "judge", verdict: "wrong" }], ["b", { type: "skip" }])} playback={null} />));
    expect(out).toMatch(/A<\/span><span[^>]*>daneben/);
    expect(out).toMatch(/B<\/span><span[^>]*>weiß nicht/);
    const vote = decode(renderToStaticMarkup(<BigScreen game={play(["a", { type: "buzz" }], ["a", { type: "answered" }], ["a", { type: "judge", verdict: "correct" }], ["b", { type: "vote", confirm: true }])} playback={null} />));
    expect(vote).toMatch(/A<\/span><span[^>]*>buzzert/);
    expect(vote).toMatch(/B<\/span><span[^>]*>stimmt</);
    expect(vote).toMatch(/H<\/span><span[^>]*>offen/);
  });
});
