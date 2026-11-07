import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameView } from "../../GameView";
import { BigScreen, BigTimeline } from "./BigScreen";
import { timelineUI } from ".";
import { Watch } from "./Watch";
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
  for (const [actor, action] of [["h", { type: "setMode", mode: "timeline" }], ["h", { type: "start" }], ...steps] as [string, Action][]) {
    const r = applyAction(game, actor, action, { now: Date.now(), random: () => 0, playlist });
    if (!r.ok) throw new Error(r.error);
    game = r.game;
  }
  return game;
}

const render = (game: Game, myId: string) =>
  renderToStaticMarkup(<GameView game={game} controls={controls} myId={myId} playback={null} notice={null} />);

describe("Zeitstrahl UI", () => {
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
    const screens = [<BigScreen key="tv" game={game} playback={null} />, <BigTimeline key="tv-wide" game={game} playback={null} />, <Watch key="phone" game={game} playback={null} />].map(el => renderToStaticMarkup(el));
    for (const html of [render(game, "h"), render(game, "a"), ...screens]) {
      expect(html).not.toContain("Secret Song");
      expect(html).not.toContain("1991");
    }
  });

  it("others see live where the active player is pointing", () => {
    const html = render(play(["h", { type: "aim", index: 1 }]), "a");
    expect(html).toContain("H tippt hier");
    expect(html).toContain("Älter");
    expect(html).toContain("Neuer");
  });

  it("spectators on a phone see the live aim and the result", () => {
    expect(renderToStaticMarkup(<Watch game={play(["h", { type: "aim", index: 1 }])} playback={null} />)).toContain("H tippt hier");
    const result = renderToStaticMarkup(<Watch game={play(["h", { type: "place", index: 1 }])} playback={null} />);
    expect(result).toContain("Secret Song");
    expect(result).toContain("1991");
  });

  it("only the next player continues after the result", () => {
    const game = play(["h", { type: "place", index: 1 }]);
    expect(render(game, "a")).toContain(">Weiter");
    expect(render(game, "h")).not.toMatch(/>Weiter(?! geht)/); // the others only vote ("Weiter geht's!")
    expect(render(game, "h")).toContain("A</strong> macht weiter");
  });

  it("marks the wrong tip and the right spot", () => {
    const html = render(play(["h", { type: "place", index: 0 }]), "a");
    expect(html).toContain("Hs Tipp");
    expect(html).toContain("gehört hierhin");
    expect(html).toContain("Sie gehört nach 1980."); // said in words, too
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

describe("Zeitstrahl gemeinsam UI", () => {
  function coop(lives: number, ...steps: [string, Action][]): Game {
    let game = newGame("g1", 0);
    for (const [i, id] of ["h", "a", "b"].entries()) game = addPlayer(game, { id, name: id.toUpperCase(), joinedAt: i })!;
    const setup: [string, Action][] = [
      ["h", { type: "setMode", mode: "timeline" }],
      ["h", { type: "updateModeSettings", patch: { coop: true, lives } }],
      ["h", { type: "start" }],
    ];
    for (const [actor, action] of [...setup, ...steps]) {
      const r = applyAction(game, actor, action, { now: Date.now(), random: () => 0, playlist });
      if (!r.ok) throw new Error(r.error);
      game = r.game;
    }
    return game;
  }

  it("shows team progress and lives; the active player decides, others suggest", () => {
    const game = coop(3, ["a", { type: "suggest", index: 1 }]);
    const active = render(game, "h");
    expect(active).toContain("Gemeinsam: 1/10 Karten");
    expect(active).toContain("3 von 3 Leben übrig");
    expect(active).toContain("Du bist dran – das Team berät");
    expect(active).toContain("Vorschlag von A");
    const other = render(game, "b");
    expect(other).toContain("Tipp eine Lücke an, um sie vorzuschlagen");
    expect(render(game, "a")).toContain("Dein Vorschlag");
    expect(renderToStaticMarkup(<BigTimeline game={game} playback={null} />)).toContain("Vorschlag von A");
  });

  it("the TV shows the timeline below the score panel, where it has the full width", () => {
    const game = play(["h", { type: "aim", index: 1 }]);
    expect(timelineUI.ScreenWide).toBe(BigTimeline);
    expect(renderToStaticMarkup(<BigScreen game={game} playback={null} />)).not.toContain("Zeitstrahl von H");
    const wide = renderToStaticMarkup(<BigTimeline game={game} playback={null} />);
    expect(wide).toContain("Zeitstrahl von H");
    expect(wide).toContain("H tippt hier");
  });

  it("a wrong card costs a life; the end screen shows the team result", () => {
    const wrong = coop(1, ["h", { type: "place", index: 0 }]); // 2000 before 1980
    expect(render(wrong, "a")).toContain("Daneben – keine Leben mehr.");
    expect(render(wrong, "a")).toContain("Zum Ergebnis");
    const over = coop(1, ["h", { type: "place", index: 0 }], ["a", { type: "next" }]);
    expect(over.status).toBe("finished");
    const html = render(over, "a");
    expect(html).toContain("Keine Leben mehr");
    expect(html).toContain("Euer Zeitstrahl");
    expect(html).not.toContain("Unentschieden");
  });
});
