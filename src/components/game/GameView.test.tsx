import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameView } from "./GameView";
import { BigScreen } from "./modes/buzzer/BigScreen";
import { Watch } from "./Watch";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game, Track } from "@/lib/game/types";
import type { GameControls, ReceivedPlayback } from "@/lib/game/useGameSession";
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

/** Spectator view on a phone (no player), with HTML entities decoded. */
const watch = (game: Game) =>
  renderToStaticMarkup(<Watch gameId={game.id} game={game} notFound={false} playback={null} />)
    .replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

/** Rendered text with HTML entities decoded. */
const render = (game: Game, myId: string, playback: ReceivedPlayback | null = null) =>
  renderToStaticMarkup(<GameView game={game} controls={controls} myId={myId} playback={playback} notice={null} />)
    .replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

const started: [string, Action][] = [["h", { type: "start" }]];
const playing: [string, Action][] = [...started, ["h", { type: "pickSong", track }]];
const buzzed: [string, Action][] = [...playing, ["a", { type: "buzz" }]];
const revealed: [string, Action][] = [...buzzed, ["h", { type: "judge", verdict: "correct" }]];

describe("GameView", () => {
  it("lobby: the host sets up and starts, the others see what will be played and wait", () => {
    const game = play();
    const host = render(game, "h");
    expect(host).toContain("Was spielen wir?");
    expect(host).toContain("Songs: Spieler wählen Songs");
    expect(host).toContain("Alle Regeln");
    expect(host).toContain("Spiel starten");
    const guest = render(game, "a");
    expect(guest).toContain("Du bist dabei, A!");
    expect(guest).toContain("Ihr spielt");
    expect(guest).toContain("Warte auf <strong class=\"text-text\">H</strong>");
    for (const hostOnly of ["Spiel starten", "Alle Regeln", "Ändern", "Musik und Gerät", "verwalten"]) expect(guest).not.toContain(hostOnly);
  });

  it("lobby: offers the TV view and shows when one is connected", () => {
    const game = play();
    expect(render(game, "h")).toContain("/game/g1/screen");
    expect(render(game, "h")).not.toContain("TV-Ansicht verbunden");
    expect(render({ ...game, connectedScreens: 1 }, "h")).toContain("TV-Ansicht verbunden");
  });

  it("lobby: host sees what's playing on which device", () => {
    const game = play();
    expect(render(game, "h")).toContain("Aktives Gerät");
    expect(render(game, "h")).toContain("Gerade läuft nichts.");
    expect(render({ ...game, device: { id: "d1", name: "Wohnzimmer", type: "Speaker" } }, "h")).toContain("Wohnzimmer");
    const playback: ReceivedPlayback = {
      receivedAt: 0,
      data: { trackId: "x", isPlaying: true, progressMs: 0, durationMs: 1000, track: { name: "Take On Me", artist: "a-ha", albumArt: null } },
    };
    expect(render(game, "h", playback)).toContain("Take On Me – a-ha");
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
    for (const html of [render(game, "a"), screen, watch(game)]) {
      expect(html).not.toContain("Bohemian Rhapsody");
      expect(html).not.toContain("Queen");
      expect(html).not.toContain("1975");
    }
    const hinted = play(...playing, ["h", { type: "hint", field: "artist" }]);
    expect(render(hinted, "a")).toContain("Queen");
    expect(render(hinted, "a")).not.toContain("Bohemian Rhapsody");
  });

  it("the TV shows who skipped, who buzzed and who is still guessing", () => {
    const tv = (game: Game) => renderToStaticMarkup(<BigScreen game={game} playback={null} />);
    const skipped = play(...playing, ["b", { type: "skip" }]);
    expect(tv(skipped)).toMatch(/A<[^>]*>· rät/);
    expect(tv(skipped)).toMatch(/B<[^>]*>· übersprungen/);
    expect(tv(play(...buzzed))).toMatch(/A<[^>]*>· hat gebuzzert/);
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
    expect(others).toContain("<strong class=\"text-text\">A</strong> macht weiter");
    expect(others).toContain("Weiter geht");
    const next = render(game, "a");
    expect(next).toContain("Du hast's erraten!");
    expect(next).toContain(">Weiter");
    expect(next).toContain("Du bist dran – alle warten auf dich");
    expect(next).not.toContain("Weiter geht");
    expect(next).toContain("Als Nächstes legt <strong");
    expect(render(game, "h")).not.toMatch(/>Weiter(?! geht)/);
    expect(render(game, "h")).toContain("A</strong> macht weiter");
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

  it("watching on a phone: join from the lobby, follow the round, see the winner", () => {
    const lobby = watch(play());
    expect(lobby).toContain("Gleich geht's los");
    expect(lobby).toContain('href="/game/g1"');
    expect(lobby).toContain("Mitspielen");

    expect(watch(play(...playing))).toContain("Wer erkennt den Song?");
    expect(watch(play(...buzzed))).toContain("A hat gebuzzert!");
    const reveal = watch(play(...revealed));
    expect(reveal).toContain("A hat's erraten!");
    expect(reveal).toContain("Bohemian Rhapsody");
    expect(reveal).not.toContain("Mitspielen");

    const finished = play(["h", { type: "updateSettings", patch: { goal: "score", targetScore: 1 } }], ...revealed, ["h", { type: "next" }]);
    expect(watch(finished)).toContain("A gewinnt!");
    expect(watch(finished)).toContain("Revanche");
  });
});
