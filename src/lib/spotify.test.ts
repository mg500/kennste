import { afterEach, describe, expect, it, vi } from "vitest";
import { DEVICE_GONE, runEffect, timing, type PlayCheck } from "./spotify";

/** Spotify's answer for GET /tracks/<id>: every test track is on album a1. */
const trackInfo = () => Response.json({ id: "t1", name: "Song - Remastered 2011", album: { uri: "spotify:album:a1" } });

/** Fakes the Spotify API: player commands get the given statuses in order (then 204), everything is recorded. */
function fakeSpotify(playStatuses: number[]) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace("https://api.spotify.com/v1", "");
    if (path.startsWith("/tracks/")) return trackInfo();
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

describe("runEffect – how long Spotify takes to report a played song", () => {
  afterEach(() => vi.unstubAllGlobals());
  const play = { type: "play", trackId: "t1" } as const;
  const opts = { retryDelayMs: 0, checkDelaysMs: [0, 0] };
  /** Options that ask Spotify, and the check they learn of. */
  function checked(base: object = opts) {
    const result: { check?: PlayCheck } = {};
    return { result, opts: { ...base, onCheck: (c: PlayCheck) => { result.check = c; } } };
  }

  /**
   * Fakes a device that only starts playing once `wakeAfter` play commands have been sent, and reports it only from
   * the `reportFrom`-th look at the player on.
   */
  function fakeDevice(wakeAfter: number, playing = { id: "t1", name: "Song" }, reportFrom = 1) {
    const calls: string[] = [];
    let plays = 0;
    let reads = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace("https://api.spotify.com/v1", "");
      if (path.startsWith("/tracks/")) return trackInfo();
      calls.push(`${init?.method ?? "GET"} ${path}${init?.body && path === "/me/player" ? ` ${init.body}` : ""}`);
      if (path.startsWith("/me/player/play")) plays++;
      if (path === "/me/player" && !init?.method) {
        const isPlaying = plays >= wakeAfter && ++reads >= reportFrom;
        return Response.json({ is_playing: isPlaying, item: playing, device: { id: "pixel", name: "Pixel", type: "Smartphone" } });
      }
      return new Response(null, { status: 204 });
    }));
    return calls;
  }

  it("tells how long Spotify took to report the track playing", async () => {
    const calls = fakeDevice(1);
    const { result, opts: o } = checked();
    expect(await runEffect("tok", play, "pixel", o)).toBeUndefined();
    expect(calls).toEqual(["PUT /me/player/play?device_id=pixel", "GET /me/player"]);
    expect(result.check?.reportedAfterMs).toBeGreaterThanOrEqual(0);
  });

  it("doesn't ask Spotify when nobody wants to know", async () => {
    const calls = fakeDevice(1);
    expect(await runEffect("tok", play, "pixel", { retryDelayMs: 0 })).toBeUndefined();
    expect(calls).toEqual(["PUT /me/player/play?device_id=pixel"]);
  });

  it("waits a few seconds for a device that reports the song late", async () => {
    timing.scale = 0;
    try {
      const calls = fakeDevice(1, undefined, 5);
      const { result, opts: o } = checked({ retryDelayMs: 0 });
      expect(await runEffect("tok", play, "pixel", o)).toBeUndefined();
      expect(result.check?.reportedAfterMs).toBeGreaterThanOrEqual(0);
      expect(calls.filter(c => c.startsWith("PUT /me/player "))).toEqual([]);
    } finally {
      timing.scale = 1;
    }
  });

  it("leaves a device alone that never reports the song, instead of waking it", async () => {
    // Google TV stick (Nov 2026): the music played although Spotify never reported it, and waking the device by a
    // transfer with play: true played the previous round's song for a moment
    const calls = fakeDevice(Infinity);
    const { result, opts: o } = checked();
    expect(await runEffect("tok", play, "pixel", o)).toBeUndefined();
    expect(result.check).toEqual({ reportedAfterMs: undefined });
    expect(calls.filter(c => c.startsWith("PUT /me/player "))).toEqual([]);
    expect(calls.filter(c => c.startsWith("PUT /me/player/play"))).toHaveLength(1);
  });

  it("counts another version of the track as playing", async () => {
    fakeDevice(1, { id: "t9", name: "Song" });
    const { result, opts: o } = checked();
    expect(await runEffect("tok", play, "pixel", o)).toBeUndefined();
    expect(result.check?.reportedAfterMs).toBeGreaterThanOrEqual(0);
  });
});

describe("runEffect – starting a track", () => {
  afterEach(() => vi.unstubAllGlobals());
  const fast = { retryDelayMs: 0, checkDelaysMs: [] };

  /** Records the bodies of play requests; album starts get `albumStatus`. */
  function fakePlay(albumStatus = 204) {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/tracks/")) return trackInfo();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      bodies.push(body);
      return body?.context_uri ? new Response(null, { status: albumStatus }) : new Response(null, { status: 204 });
    }));
    return bodies;
  }

  it("starts the track via its album, where the Spotify apps play it", async () => {
    const bodies = fakePlay();
    expect(await runEffect("tok", { type: "play", trackId: "t1", positionMs: 5000 }, "mac", fast)).toBeUndefined();
    expect(bodies).toEqual([{ context_uri: "spotify:album:a1", offset: { uri: "spotify:track:t1" }, position_ms: 5000 }]);
  });

  it("falls back to the track alone if the album start is rejected", async () => {
    const bodies = fakePlay(400);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await runEffect("tok", { type: "play", trackId: "t1" }, "mac", fast)).toBeUndefined();
    expect(bodies.at(-1)).toEqual({ uris: ["spotify:track:t1"] });
  });
});
