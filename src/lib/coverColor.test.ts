import { afterEach, describe, expect, it, vi } from "vitest";
import { encode } from "jpeg-js";
import { accentOf } from "./accentColor";
import { clearCoverColors, coverColor } from "./coverColor";

/** Pixels (RGBA): `share` of them in `color`, the rest near-black. */
function pixels(color: [number, number, number], share = 1, count = 400): Uint8Array {
  const data = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) data.set(i < count * share ? [...color, 255] : [10, 10, 12, 255], i * 4);
  return data;
}
const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return r > g && r > b ? "red" : g > r && g > b ? "green" : "blue";
};
const jpeg = (color: [number, number, number]) => encode({ data: pixels(color, 1, 32 * 32), width: 32, height: 32 }, 90).data;

afterEach(() => { clearCoverColors(); vi.unstubAllGlobals(); });

describe("accentOf", () => {
  it("finds the cover's main hue, bright enough to glow", () => {
    expect(hue(accentOf(pixels([200, 30, 40]))!)).toBe("red");
    expect(hue(accentOf(pixels([30, 90, 210]))!)).toBe("blue");
    expect(hue(accentOf(pixels([30, 150, 80], 0.4))!)).toBe("green"); // on a black background
  });

  it("has none for grey, black or nearly black covers – the stage keeps its light", () => {
    expect(accentOf(pixels([128, 128, 128]))).toBeNull();
    expect(accentOf(pixels([0, 0, 0]))).toBeNull();
    expect(accentOf(pixels([200, 30, 40], 0.02))).toBeNull(); // a little red writing on black
  });
});

describe("coverColor", () => {
  it("reads a cover from Spotify's image server once", async () => {
    const fetch = vi.fn(async () => new Response(jpeg([200, 30, 40]) as BodyInit));
    vi.stubGlobal("fetch", fetch);
    const url = "https://i.scdn.co/image/ab67616d0000b273";
    expect(hue((await coverColor(url))!)).toBe("red");
    await coverColor(url);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fetches nothing but Spotify's covers, and has no color when one can't be read", async () => {
    const fetch = vi.fn(async () => new Response("not a jpeg"));
    vi.stubGlobal("fetch", fetch);
    // Players send the cover URL of a song they picked
    for (const url of ["http://i.scdn.co/image/x", "https://example.com/x.jpg", "https://i.scdn.co.evil.de/x", "http://127.0.0.1/x", null]) {
      expect(await coverColor(url)).toBeNull();
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(await coverColor("https://i.scdn.co/image/broken")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await coverColor("https://i.scdn.co/image/offline")).toBeNull();
  });
});
