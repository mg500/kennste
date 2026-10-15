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
  const fast = { retryDelayMs: 0, checkDelaysMs: [] };

  it("wakes a dormant device and plays again", async () => {
    const calls = fakeSpotify([404, 502]);
    expect(await runEffect("tok", play, "pixel", fast)).toBeUndefined();
    expect(calls).toEqual([
      "PUT /me/player/play?device_id=pixel", "PUT /me/player",
      "PUT /me/player/play?device_id=pixel", "PUT /me/player",
      "PUT /me/player/play?device_id=pixel",
    ]);
  });

  it("gives up after two retries", async () => {
    fakeSpotify([404, 404, 404]);
    expect(await runEffect("tok", play, "pixel", fast)).toBe(DEVICE_GONE);
  });

  it("passes Spotify's reason on", async () => {
    fakeSpotify([502, 502, 502]);
    expect(await runEffect("tok", play, "pixel", fast)).toBe("Spotify-Wiedergabe fehlgeschlagen (Device not found)");
  });

  it("does not retry without a picked device", async () => {
    const calls = fakeSpotify([404]);
    expect(await runEffect("tok", play, undefined, fast)).toMatch(/Kein aktives Spotify-Gerät/);
    expect(calls).toEqual(["PUT /me/player/play"]);
  });

  it("treats pausing while paused and resuming while playing as done", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { status: 403, message: "Player command failed: Restriction violated", reason: "UNKNOWN" } }, { status: 403 })));
    expect(await runEffect("tok", { type: "pause" }, "pixel", fast)).toBeUndefined();
    expect(await runEffect("tok", { type: "play" }, "pixel", fast)).toBeUndefined();
    expect(await runEffect("tok", play, "pixel", fast)).toBe("Spotify-Wiedergabe fehlgeschlagen (UNKNOWN)");
  });
});

describe("runEffect – checking that the song really plays", () => {
  afterEach(() => vi.unstubAllGlobals());
  const play = { type: "play", trackId: "t1" } as const;
  const opts = { retryDelayMs: 0, checkDelaysMs: [0, 0] };

  /** Fakes a device that only starts playing once `wakeAfter` play commands have been sent. */
  function fakeDevice(wakeAfter: number) {
    const calls: string[] = [];
    let plays = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace("https://api.spotify.com/v1", "");
      calls.push(`${init?.method ?? "GET"} ${path}${init?.body && path === "/me/player" ? ` ${init.body}` : ""}`);
      if (path.startsWith("/me/player/play")) plays++;
      if (path === "/me/player" && !init?.method) {
        const playing = plays >= wakeAfter;
        return Response.json({ is_playing: playing, item: { id: "t1", name: "Song" }, device: { id: "pixel", name: "Pixel", type: "Smartphone" } });
      }
      return new Response(null, { status: 204 });
    }));
    return calls;
  }

  it("is done once Spotify reports the track playing", async () => {
    const calls = fakeDevice(1);
    expect(await runEffect("tok", play, "pixel", opts)).toBeUndefined();
    expect(calls).toEqual(["PUT /me/player/play?device_id=pixel", "GET /me/player"]);
  });

  it("wakes a device that accepted the command but stays silent", async () => {
    const calls = fakeDevice(2);
    expect(await runEffect("tok", play, "pixel", opts)).toBeUndefined();
    expect(calls).toContain('PUT /me/player {"device_ids":["pixel"],"play":true}');
    expect(calls.filter(c => c.startsWith("PUT /me/player/play"))).toHaveLength(2);
  });

  it("reports a device that never reacts", async () => {
    fakeDevice(Infinity);
    expect(await runEffect("tok", play, "pixel", opts)).toMatch(/Gerät reagiert nicht/);
  });
});
