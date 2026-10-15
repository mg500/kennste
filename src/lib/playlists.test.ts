import { describe, expect, it } from "vitest";
import { parsePlaylistLink, queueBlocks } from "./playlists";

describe("parsePlaylistLink", () => {
  it("finds the playlist in links and URIs", () => {
    expect(parsePlaylistLink("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc")).toBe("37i9dQZF1DXcBWIGoYBM5M");
    expect(parsePlaylistLink("https://open.spotify.com/intl-de/playlist/37i9dQZF1DXcBWIGoYBM5M")).toBe("37i9dQZF1DXcBWIGoYBM5M");
    expect(parsePlaylistLink("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")).toBe("37i9dQZF1DXcBWIGoYBM5M");
    expect(parsePlaylistLink("Hits der 90er")).toBeNull();
  });
});

describe("queueBlocks", () => {
  it("covers the whole playlist once, starting at a random block", () => {
    expect(queueBlocks(50, () => 0)).toEqual([0, 21, 42]);
    expect(queueBlocks(50, () => 0.5)).toEqual([21, 42, 0]);
    expect(queueBlocks(21, () => 0.9)).toEqual([0]);
  });

  it("reads just the first block when the size is unknown", () => {
    expect(queueBlocks(0, () => 0.7)).toEqual([0]);
  });
});
