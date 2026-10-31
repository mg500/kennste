import { describe, expect, it } from "vitest";
import { buzzerData } from "./modes/buzzer";
import { choiceData } from "./modes/choice";
import { getMode, MODES, type ModeId } from "./modes";
import { togetherData } from "./modes/together";
import { yearData } from "./modes/year";
import { addPlayer, applyAction, newGame, type Context } from "./reducer";
import type { Action, Game, Track } from "./types";
import { viewFor } from "./view";

// Every song has its own name and year, so a leak of the running one shows up in the JSON
const track = (i: number): Track => ({
  id: `spotify${i}`, name: `Title ${i}`, artist: `Band ${i}`, releaseYear: String(1950 + i * 3), albumArt: `cover${i}.jpg`, previewUrl: null,
});
const playlist = Array.from({ length: 12 }, (_, i) => track(i));
const ctx: Context = { now: 1000, random: () => 0, playlist };
const mask = (id: string) => `masked-${id.length}-${[...id].reverse().join("")}`;

function act(game: Game, actor: string, action: Action): Game {
  const r = applyAction(game, actor, action, ctx);
  if (!r.ok) throw new Error(`${action.type} by ${actor} failed: ${r.error}`);
  return r.game;
}

const active = (g: Game) => g.players[g.currentPlayerIndex].id;

/** A running game of `mode` with a song playing (from the playlist, in the buzzer quiz picked by whoever is up), players h (host), a and b. */
function started(mode: ModeId): Game {
  let g = newGame("g1", 0);
  for (const [i, id] of ["h", "a", "b"].entries()) g = addPlayer(g, { id, name: id.toUpperCase(), joinedAt: i })!;
  g = act(g, "h", { type: "setMode", mode });
  g = act(g, "h", { type: "start" });
  return mode === "buzzer" ? act(g, active(g), { type: "pickSong", track: playlist[0] }) : g;
}

const current = (g: Game) => playlist.find(t => t.id === getMode(g.mode.id).currentTrackId(g.mode))!;

describe("what a device sees of the running song", () => {
  it.each(Object.keys(MODES) as ModeId[])("%s: neither the TV nor a guesser can look up the running song", mode => {
    const g = started(mode);
    const song = current(g);
    for (const viewer of [null, "a", "b"]) {
      if (mode === "buzzer" && viewer === active(g)) continue; // put the song on, knows it
      const json = JSON.stringify(viewFor(g, viewer, mask));
      expect(json, `${mode}, viewer ${viewer}`).not.toContain(song.id);
      // Song-Tipp offers the right title among its options – by design
      if (mode !== "choice") expect(json, `${mode}, viewer ${viewer}`).not.toContain(song.name);
    }
  });

  it.each(Object.keys(MODES) as ModeId[])("%s: everyone gets the same stand-in, so the playback bar finds the song", mode => {
    const g = started(mode);
    for (const viewer of [null, "h", "a"]) {
      const view = viewFor(g, viewer, mask);
      expect(getMode(mode).currentTrackId(view.mode)).toBe(mask(current(g).id));
    }
  });

  it("changes nothing outside a game", () => {
    let g = newGame("g1", 0);
    g = addPlayer(g, { id: "h", name: "H", joinedAt: 0 })!;
    expect(viewFor(g, null, mask)).toBe(g);
  });
});

describe("Buzzer-Quiz", () => {
  it("the guessers only get the hints given so far, whoever put the song on all of it, after the reveal everyone", () => {
    let g = started("buzzer");
    const dj = active(g);
    const guesser = ["h", "a", "b"].find(id => id !== dj)!;
    const song = current(g);

    expect(buzzerData(viewFor(g, dj, mask)).round?.track).toMatchObject({ name: song.name, artist: song.artist, releaseYear: song.releaseYear });
    const hidden = buzzerData(viewFor(g, guesser, mask)).round!.track!;
    expect(hidden).toMatchObject({ name: "", artist: "", albumArt: song.albumArt }); // the cover is shown blurred
    expect(hidden.releaseYear).toBeUndefined();

    g = act(g, dj, { type: "hint", field: "artist" });
    expect(buzzerData(viewFor(g, guesser, mask)).round?.track).toMatchObject({ name: "", artist: song.artist });

    g = act(g, dj, { type: "reveal" });
    expect(buzzerData(viewFor(g, null, mask)).round?.track).toMatchObject({ name: song.name, artist: song.artist, releaseYear: song.releaseYear });
  });
});

describe("Jahr schätzen", () => {
  it("shows who guessed, but only their own year – until the reveal", () => {
    let g = started("year");
    g = act(g, "a", { type: "guess", year: 1977 });
    g = act(g, "b", { type: "guess", year: 1988, draft: true });

    const forA = yearData(viewFor(g, "a", mask)).round!;
    expect(forA.guesses).toEqual({ a: 1977 });
    expect(forA.drafts ?? {}).toEqual({});
    const forH = yearData(viewFor(g, "h", mask)).round!;
    expect(forH.guesses).toEqual({ a: 0 }); // "getippt" on the TV and the phones
    expect(JSON.stringify(viewFor(g, null, mask))).not.toMatch(/1977|1988/);
    expect(yearData(viewFor(g, "b", mask)).round?.drafts).toEqual({ b: 1988 }); // survives a reload

    g = act(g, "h", { type: "guess", year: 1990 });
    g = act(g, "b", { type: "guess", year: 1988 });
    expect(yearData(viewFor(g, null, mask)).round).toMatchObject({ state: "revealed", guesses: { a: 1977, b: 1988, h: 1990 } });
  });
});

describe("Song-Tipp", () => {
  it("shows who answered, but only their own answer – until the reveal", () => {
    let g = started("choice");
    g = act(g, "a", { type: "answer", option: 2 });
    expect(choiceData(viewFor(g, "a", mask)).round?.answers).toEqual({ a: { option: 2, at: 1000 } });
    expect(choiceData(viewFor(g, "b", mask)).round?.answers).toEqual({ a: { option: -1, at: 0 } });

    g = act(g, "b", { type: "answer", option: 1 });
    g = act(g, "h", { type: "answer", option: 0 });
    expect(choiceData(viewFor(g, null, mask)).round?.answers.a).toEqual({ option: 2, at: 1000 });
  });
});

describe("Zeitstrahl für alle", () => {
  it("everyone only sees their own gap until the reveal", () => {
    let g = started("together");
    g = act(g, "a", { type: "pick", index: 1 });
    g = act(g, "b", { type: "pick", index: 0, done: true });
    expect(togetherData(viewFor(g, "a", mask)).round).toMatchObject({ picks: { a: 1 }, done: ["b"] });
    expect(togetherData(viewFor(g, null, mask)).round?.picks).toEqual({});

    g = act(g, "a", { type: "pick", index: 1, done: true });
    g = act(g, "h", { type: "pick", index: 1, done: true });
    expect(togetherData(viewFor(g, null, mask)).round?.picks).toEqual({ a: 1, b: 0, h: 1 });
  });
});
