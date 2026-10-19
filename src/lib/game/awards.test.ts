import { describe, expect, it } from "vitest";
import { addPlayer, newGame } from "./reducer";
import { computeAwards, playedSongs } from "./awards";
import type { Game, PlayerRoundStats, RoundRecord } from "./types";

const song = (n: number): RoundRecord["song"] => ({ trackId: `t${n}`, name: `Song ${n}`, artist: "A", albumArt: null });

/** A finished game of `mode` with players h, a, b, c and the given rounds. */
function game(mode: Game["mode"]["id"], rounds: [Record<string, number>, Record<string, PlayerRoundStats>, string?][]): Game {
  let g = newGame("g1", 0);
  for (const [i, id] of ["h", "a", "b", "c"].entries()) g = addPlayer(g, { id, name: id.toUpperCase(), joinedAt: i })!;
  const all = (stats: Record<string, PlayerRoundStats>) => ({ h: {}, a: {}, b: {}, c: {}, ...stats });
  return {
    ...g, status: "finished", mode: { ...g.mode, id: mode } as Game["mode"],
    history: rounds.map(([points, stats, pickedBy], i) => ({ round: i + 1, song: song(i + 1), points, stats: all(stats), ...(pickedBy ? { pickedBy } : {}) })),
  };
}
const byId = (g: Game) => Object.fromEntries(computeAwards(g).map(a => [a.id, a]));

describe("awards", () => {
  it("Alle gegen alle: fastest, streak, brave, honest, strict jury – each needs a real achievement", () => {
    const g = game("versus", [
      [{ a: 1 }, { a: { buzzes: 1, rightMs: 4200 }, b: { buzzes: 2, selfWrong: 1 }, c: { votedNo: 1 } }],
      [{ a: 1 }, { a: { buzzes: 1, rightMs: 1800 }, b: { buzzes: 2, selfWrong: 1 }, c: { votedNo: 1 } }],
      [{ a: 1 }, { a: { buzzes: 1, rightMs: 3000 }, b: { buzzes: 1 } }],
      [{ b: 1 }, { b: { buzzes: 1, rightMs: 5000 }, a: { buzzes: 1, selfWrong: 1 } }],
    ]);
    const awards = byId(g);
    expect(awards.fast).toMatchObject({ title: "Blitzmerker", playerIds: ["a"], fact: "„Song 2“ nach 1,8 s erkannt" });
    expect(awards.streak).toMatchObject({ playerIds: ["a"], fact: "3 Songs in Folge richtig" });
    expect(awards.brave).toMatchObject({ playerIds: ["b"], fact: "6× gebuzzert, 1× richtig" });
    expect(awards.honest).toMatchObject({ playerIds: ["b"], fact: "Sich 2× selbst „falsch“ gegeben" });
    expect(awards.jury).toMatchObject({ playerIds: ["c"], fact: "2× „Stimmt nicht“ gestimmt" });
    expect(computeAwards(g).length).toBeLessThanOrEqual(5);
  });

  it("nothing special → no awards; ties share one", () => {
    expect(computeAwards(game("versus", [[{ a: 1 }, { a: { buzzes: 1 } }]]))).toEqual([]);
    const tie = game("year", [[{ a: 3, b: 3 }, { a: { yearsOff: 0 }, b: { yearsOff: 0 }, c: { yearsOff: 9 } }]]);
    expect(byId(tie).bullseye).toMatchObject({ playerIds: ["a", "b"], fact: "Ein Jahr exakt getroffen" });
  });

  it("Jahr schätzen: close calls and the time traveler", () => {
    const g = game("year", [
      [{ a: 2 }, { a: { yearsOff: 1 }, c: { yearsOff: 12 } }],
      [{ a: 2 }, { a: { yearsOff: 1 }, c: { yearsOff: 8 } }],
      [{}, { a: { yearsOff: 7 }, c: { yearsOff: 10 } }],
    ]);
    expect(byId(g).close).toMatchObject({ playerIds: ["a"], fact: "2× nur ein Jahr daneben" });
    expect(byId(g).timeTraveler).toMatchObject({ playerIds: ["c"], fact: "Im Schnitt 10 Jahre daneben" });
  });

  it("Zeitstrahl: the narrowest right gap; in timeline modes the streak is about cards", () => {
    const g = game("together", [
      [{ a: 1 }, { a: { gap: [1985, 1987] } }], [{ a: 1 }, {}], [{ a: 1 }, { a: { gap: [1970, 1990] } }],
    ]);
    expect(byId(g).boldGap).toMatchObject({ playerIds: ["a"], fact: "Richtig zwischen 1985 und 1987" });
    expect(byId(g).streak).toMatchObject({ title: "Sicher gelegt", fact: "3 Karten in Folge richtig" });
  });

  it("buzzer quiz with own songs: the DJ nobody could guess; the comeback from last place", () => {
    const g = game("buzzer", [
      [{ h: 1 }, {}, "a"], [{ a: 1 }, {}, "b"], [{ b: 1 }, {}, "h"], [{}, {}, "c"], [{}, {}, "c"],
      [{ c: 1 }, {}, "a"], [{ c: 1 }, {}, "b"], [{ c: 1 }, {}, "h"],
    ]);
    expect(byId(g).dj).toMatchObject({ playerIds: ["c"], fact: "2 Songs, die keiner erkannt hat" });
    expect(byId(g).comeback).toMatchObject({ playerIds: ["c"], fact: "3 Plätze nach vorn" }); // last after round 3, first at the end
  });

  it("lists every song once with who scored on it", () => {
    const g = game("year", [[{ a: 3, b: 0 }, {}], [{}, {}]]);
    expect(playedSongs(g)).toEqual([{ song: song(1), scorers: ["a"] }, { song: song(2), scorers: [] }]);
  });
});
