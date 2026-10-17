import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timing } from "./spotify";
import { earliestFromIsrc, earliestFromSearch, musicBrainzDown, normalizeTitle, withOriginalYear } from "./releaseYear";
import type { Track } from "./game/types";

describe("normalizeTitle", () => {
  it("strips remaster and version suffixes", () => {
    expect(normalizeTitle("Don’t Stop Me Now - Remastered 2011")).toBe("don't stop me now");
    expect(normalizeTitle("Take On Me (1985 12\" Version)")).toBe("take on me");
    expect(normalizeTitle("Billie Jean [Live]")).toBe("billie jean");
  });
});

describe("earliest year", () => {
  it("takes the earliest first-release-date of an ISRC lookup", () => {
    expect(earliestFromIsrc([{ "first-release-date": "2011-03-14" }, { "first-release-date": "1975-11-21" }, {}])).toBe(1975);
    expect(earliestFromIsrc([])).toBeUndefined();
  });

  it("only trusts confident search hits by the artist with a matching title", () => {
    const queen = [{ name: "Queen", artist: { name: "Queen" } }];
    const hits = [
      { title: "Don’t Stop Me Now", score: 100, "first-release-date": "2007-03-26", "artist-credit": queen },
      { title: "Don't Stop Me Now (live)", score: 100, "first-release-date": "1978-11-10", "artist-credit": queen },
      { title: "Don't Stop Believin'", score: 95, "first-release-date": "1960", "artist-credit": queen },  // different song
      { title: "Don't Stop Me Now", score: 40, "first-release-date": "1950", "artist-credit": queen },     // weak match
      { title: "Don't Stop Me Now", score: 98, "first-release-date": "1965", "artist-credit": [{ name: "Some Band" }] }, // other artist
      { title: "Don't Stop Me Now", score: 98, "first-release-date": "1966" },                            // nobody credited
    ];
    expect(earliestFromSearch(hits, "Don't Stop Me Now - Remastered 2011", "Queen")).toBe(1978);
    expect(earliestFromSearch([{ ...hits[1], "artist-credit": [{ name: "The Beatles" }] }], "Don't Stop Me Now", "Beatles")).toBe(1978);
  });
});

describe("withOriginalYear", () => {
  const track = (name: string): Track => ({ id: name, name, artist: "Queen", releaseYear: "2011", albumArt: null, previewUrl: null });
  const found = (title: string, date: string) => ({ recordings: [{ title, score: 100, "first-release-date": date, "artist-credit": [{ name: "Queen" }] }] });
  beforeEach(() => { timing.scale = 0; });
  afterEach(() => { timing.scale = 1; vi.unstubAllGlobals(); });

  it("corrects a remaster to the original release", async () => {
    vi.stubGlobal("fetch", async () => Response.json(found("Bohemian Rhapsody", "1975-10-31")));
    expect(await withOriginalYear(track("Bohemian Rhapsody"))).toMatchObject({ releaseYear: "1975", yearVerified: true });
  });

  it("does not mark the year as checked when MusicBrainz can't answer (503: too many requests), and asks again later", async () => {
    const song = track("Killer Queen - Remastered 2011");
    vi.stubGlobal("fetch", async () => new Response(null, { status: 503 }));
    const failed = await withOriginalYear(song);
    expect(failed).toMatchObject({ releaseYear: "2011" });
    expect(failed.yearVerified).toBeFalsy();
    expect(musicBrainzDown()).toBe(true); // rounds don't wait for it now
    vi.stubGlobal("fetch", async () => Response.json(found("Killer Queen", "1974-10-11")));
    expect(await withOriginalYear(failed)).toMatchObject({ releaseYear: "1974", yearVerified: true });
    expect(musicBrainzDown()).toBe(false);
  });
});
