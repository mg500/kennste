import { afterEach, describe, expect, it, vi } from "vitest";
import { DEVICE_GONE, runEffect } from "./spotify";

/** Fakes the Spotify API: player commands get the given statuses in order (then 204), everything is recorded. */
function fakeSpotify(playStatuses: number[]) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace("https://api.spotify.com/v1", "");
    calls.push(`${init?.method ?? "GET"} ${path}`);
    const status = path.startsWith("/me/player/play") ? playStatuses.shift() ?? 204 : 204;
    return status === 204 ? new Response(null, { status }) : Response.json({ error: { status, message: "Device not found" } }, { status });
  }));
  return calls;
}

describe("runEffect", () => {
  afterEach(() => vi.unstubAllGlobals());
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const play = { type: "play", trackId: "t1" } as const;

  it("wakes a dormant device and plays again", async () => {
    const calls = fakeSpotify([404, 502]);
    expect(await runEffect("tok", play, "pixel", { retryDelayMs: 0 })).toBeUndefined();
    expect(calls).toEqual([
      "PUT /me/player/play?device_id=pixel", "PUT /me/player",
      "PUT /me/player/play?device_id=pixel", "PUT /me/player",
      "PUT /me/player/play?device_id=pixel",
    ]);
  });

  it("gives up after two retries", async () => {
    fakeSpotify([404, 404, 404]);
    expect(await runEffect("tok", play, "pixel", { retryDelayMs: 0 })).toBe(DEVICE_GONE);
  });

  it("passes Spotify's reason on", async () => {
    fakeSpotify([502, 502, 502]);
    expect(await runEffect("tok", play, "pixel", { retryDelayMs: 0 })).toBe("Spotify-Wiedergabe fehlgeschlagen (Device not found)");
  });

  it("does not retry without a picked device", async () => {
    const calls = fakeSpotify([404]);
    expect(await runEffect("tok", play)).toMatch(/Kein aktives Spotify-Gerät/);
    expect(calls).toEqual(["PUT /me/player/play"]);
  });
});
