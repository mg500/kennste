import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameView } from "../../GameView";
import { BigScreen } from "./BigScreen";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game, Track } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import type { GameApi } from "@/lib/game/client";

const track = (id: string, name: string, year: number): Track => ({ id, name, artist: `Artist ${id}`, releaseYear: String(year), albumArt: null, previewUrl: null });
const playlist = [track("s1", "Start Song H", 1980), track("s2", "Start Song A", 2000), track("p1", "Secret Song", 1991)];
const controls: GameControls = { api: {} as GameApi, act: async () => {}, applyGame: () => {} };

function play(...steps: [string, Action][]): Game {
  let game = newGame("g1", 0);
  for (const [i, id] of ["h", "a"].entries()) game = addPlayer(game, { id, name: id.toUpperCase(), joinedAt: i })!;
  for (const [actor, action] of [["h", { type: "setMode", mode: "hitster" }], ["h", { type: "start" }], ...steps] as [string, Action][]) {
    const r = applyAction(game, actor, action, { now: Date.now(), random: () => 0, playlist });
    if (!r.ok) throw new Error(r.error);
    game = r.game;
  }
  return game;
}

const render = (game: Game, myId: string) =>
  renderToStaticMarkup(<GameView game={game} controls={controls} myId={myId} playback={null} notice={null} />);

describe("Hitster UI", () => {
  it("active player places the song into their timeline", () => {
    const html = render(play(), "h");
    expect(html).toContain("Wann kam dieser Song raus?");
    expect(html).toContain("Start Song H");
    expect(html).toContain("Hier einordnen");
    expect(html).toContain("Bis 10 Karten");
  });

  it("others watch the active player's timeline", () => {
    const html = render(play(), "a");
    expect(html).toContain("H ordnet ein");
    expect(html).toContain("Hs Zeitstrahl");
    expect(html).not.toContain("Hier einordnen");
  });

  it("never reveals the current song before it is placed", () => {
    const game = play();
    for (const html of [render(game, "h"), render(game, "a"), renderToStaticMarkup(<BigScreen game={game} playback={null} />)]) {
      expect(html).not.toContain("Secret Song");
      expect(html).not.toContain("1991");
    }
  });

  it("others see live where the active player is pointing", () => {
    const html = render(play(["h", { type: "aim", index: 1 }]), "a");
    expect(html).toContain("H tippt hier");
    expect(html).toContain("Früher");
    expect(html).toContain("Heute");
  });

  it("only the next player continues after the result", () => {
    const game = play(["h", { type: "place", index: 1 }]);
    expect(render(game, "a")).toContain(">Weiter");
    expect(render(game, "h")).not.toContain(">Weiter");
    expect(render(game, "h")).toContain("Warte auf A");
  });

  it("marks the wrong tip and the right spot", () => {
    const html = render(play(["h", { type: "place", index: 0 }]), "a");
    expect(html).toContain("Hs Tipp");
    expect(html).toContain("gehört hierhin");
  });

  it("shows the result after placing", () => {
    const right = play(["h", { type: "place", index: 1 }]);
    expect(render(right, "h")).toContain("Richtig! Die Karte gehört dir.");
    expect(render(right, "a")).toContain("Secret Song");
    expect(render(right, "a")).toContain("1991");

    const wrong = play(["h", { type: "place", index: 0 }]);
    expect(render(wrong, "a")).toContain("Daneben");
    expect(render(wrong, "a")).toContain("gehört hierhin");
  });
});
