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
      lag: 2,
    });
    vi.stubGlobal("fetch", sim.fetch);
    await sim.fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT", body: JSON.stringify({ context_uri: "spotify:album:al200", offset: { uri: "spotify:track:t200" }, position_ms: 30_000 }),
    });
    sim.settle();

    const steps = await runDiagnosis("token");
    expect(steps.filter(s => s.ok !== true)).toEqual([]);
    expect(steps.map(s => s.name)).toContain("Warteschlange ab Position 21 lesen");
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

  it("stops early without a device", async () => {
    const sim = createSpotifySim({ tracks, devices: [] });
    vi.stubGlobal("fetch", sim.fetch);
    const steps = await runDiagnosis("token");
    expect(steps.at(-1)).toMatchObject({ name: "Wiedergabegerät", ok: false });
  });
});
