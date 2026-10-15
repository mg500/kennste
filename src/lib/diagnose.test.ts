import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpotifySim, trackFixture } from "@/test/spotifySim";
import { runDiagnosis } from "./diagnose";
import { timing } from "./spotify";

const tracks = Array.from({ length: 260 }, (_, i) => trackFixture(i));
const ids = (from: number, count: number) => Array.from({ length: count }, (_, i) => `t${from + i}`);

beforeEach(() => { timing.scale = 0; });
afterEach(() => { timing.scale = 1; vi.unstubAllGlobals(); });

describe("runDiagnosis", () => {
  it("passes against a Spotify that behaves as the game assumes, and leaves the player as it was", async () => {
    const sim = createSpotifySim({
      tracks,
      playlists: [
        { id: "mine", name: "Meine Songs", owner: "me", own: true, trackIds: ids(0, 50) },
        { id: "hits", name: "Hits der 90er", owner: "spotify", own: false, trackIds: ids(100, 60) },
      ],
      lag: 6,
    });
    vi.stubGlobal("fetch", sim.fetch);
    await sim.fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT", body: JSON.stringify({ context_uri: "spotify:album:al200", offset: { uri: "spotify:track:t200" }, position_ms: 30_000 }),
    });
    sim.settle();

    const steps = await runDiagnosis("token");
    expect(steps.filter(s => s.ok !== true)).toEqual([]);
    expect(steps.map(s => s.name)).toContain("Warteschlange ab Position 21 lesen (Shuffle aus)");
    expect(steps.map(s => s.name)).toContain("Warteschlange ab Position 21 lesen (Shuffle an)");
    sim.settle();
    expect(sim.current()?.id).toBe("t200");
    expect(sim.player.isPlaying).toBe(true);
    expect(sim.player.progressMs).toBe(30_000);
    expect(sim.player.shuffle).toBe(false);
  });

  it("notices when the queue does not follow the playlist", async () => {
    const sim = createSpotifySim({ tracks, playlists: [{ id: "mine", name: "Meine Songs", owner: "me", own: true, trackIds: ids(0, 50) }] });
    // A Spotify that ignores the shuffle switch
    const fetch = sim.fetch;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      String(url).includes("/me/player/shuffle?state=false") ? Promise.resolve(new Response(null, { status: 204 })) : fetch(url, init));
    sim.player.shuffle = true;

    const steps = await runDiagnosis("token");
    expect(steps.find(s => s.name.startsWith("Warteschlange"))?.ok).toBe(false);
  });

  it("accepts a later start when Spotify skipped a song it can't play", async () => {
    const withGap = tracks.map(t => (t.id === "t21" ? { ...t, unplayable: true } : t));
    const sim = createSpotifySim({ tracks: withGap, playlists: [{ id: "mine", name: "Meine Songs", owner: "me", own: true, trackIds: ids(0, 50) }] });
    vi.stubGlobal("fetch", sim.fetch);
    const queue = (await runDiagnosis("token")).find(s => s.name.startsWith("Warteschlange"))!;
    expect(queue.ok).toBe(true);
    expect(queue.detail).toContain("beginnt bei Position 22 statt 21");
    expect(queue.detail).toContain("„Song 21“ (nicht abspielbar)");
  });

  it.each([[1, true], [2, false]])("evens out Spotify starting %i song(s) too late: %s", async (shift, ok) => {
    const sim = createSpotifySim({ tracks, playlists: [{ id: "mine", name: "Meine Songs", owner: "me", own: true, trackIds: ids(0, 50) }], offsetShift: shift });
    vi.stubGlobal("fetch", sim.fetch);
    const queue = (await runDiagnosis("token")).find(s => s.name.startsWith("Warteschlange"))!;
    expect(queue.ok).toBe(ok);
    expect(queue.detail).toContain(`beginnt bei Position ${21 + shift} statt 21`);
    expect(queue.detail).toContain("„Song 21“ (abspielbar)");
  });

  it("checks another device than the active one and leaves the music there", async () => {
    const sim = createSpotifySim({
      tracks, lag: 2,
      playlists: [{ id: "mine", name: "Meine Songs", owner: "me", own: true, trackIds: ids(0, 50) }],
      devices: [{ id: "mac", name: "MacBook", type: "Computer" }, { id: "phone", name: "iPhone", type: "Smartphone" }],
    });
    vi.stubGlobal("fetch", sim.fetch);
    await sim.fetch("https://api.spotify.com/v1/me/player/play", { method: "PUT", body: JSON.stringify({ uris: ["spotify:track:t200"] }) });
    sim.settle();

    const steps = await runDiagnosis("token", { deviceId: "phone" });
    expect(steps.filter(s => s.ok === false)).toEqual([]);
    expect(steps.find(s => s.name === "Wiedergabe aufs Gerät übertragen")?.ok).toBe(true);
    sim.settle();
    expect(sim.player.deviceId).toBe("phone");
    expect(sim.current()?.id).toBe("t200");
  });

  it("refuses devices Spotify does not let it control", async () => {
    const sim = createSpotifySim({ tracks, devices: [{ id: "tv", name: "Samsung TV", type: "TV", restricted: true }] });
    vi.stubGlobal("fetch", sim.fetch);
    const steps = await runDiagnosis("token", { deviceId: "tv" });
    expect(steps.at(-1)).toMatchObject({ name: "Wiedergabegerät", ok: false });
    expect(steps.at(-1)?.detail).toContain("nicht fernsteuern");
  });

  it("notices when Spotify ignores the start position", async () => {
    const sim = createSpotifySim({ tracks, playlists: [{ id: "mine", name: "Meine Songs", owner: "me", own: true, trackIds: ids(0, 50) }] });
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (body?.position_ms) return sim.fetch(url, { ...init, body: JSON.stringify({ ...body, position_ms: undefined }) });
      return sim.fetch(url, init);
    });
    const step = (await runDiagnosis("token")).find(s => s.name.startsWith("Song an bestimmter Stelle"))!;
    expect(step.ok).toBe(false);
    expect(step.detail).toContain("Angefordert 1:00, Spotify spielt bei 0:00");
  });

  it("stops early without a device", async () => {
    const sim = createSpotifySim({ tracks, devices: [] });
    vi.stubGlobal("fetch", sim.fetch);
    const steps = await runDiagnosis("token");
    expect(steps.at(-1)).toMatchObject({ name: "Wiedergabegerät", ok: false });
  });
});
