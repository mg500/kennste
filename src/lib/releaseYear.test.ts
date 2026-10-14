import { describe, expect, it } from "vitest";
import { earliestFromIsrc, earliestFromSearch, normalizeTitle } from "./releaseYear";

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

  it("only trusts confident search hits with a matching title", () => {
    const hits = [
      { title: "Don’t Stop Me Now", score: 100, "first-release-date": "2007-03-26" },
      { title: "Don't Stop Me Now (live)", score: 100, "first-release-date": "1978-11-10" },
      { title: "Don't Stop Believin'", score: 95, "first-release-date": "1960" },  // different song
      { title: "Don't Stop Me Now", score: 40, "first-release-date": "1950" },     // weak match
    ];
    expect(earliestFromSearch(hits, "Don't Stop Me Now - Remastered 2011")).toBe(1978);
  });
});
