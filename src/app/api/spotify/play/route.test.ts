import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ sessionAccessToken: async () => "tok" }));

const post = (body: unknown) => POST(new Request("http://test/", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/spotify/play", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("plays a track on the device, or moves playback there", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace("https://api.spotify.com/v1", "");
      // Spotify reports the track playing right away
      if (!init?.method) return Response.json({ is_playing: true, item: { id: "t1", name: "Song" }, device: { id: "beamer", name: "Beamer", type: "TV" } });
      calls.push(`${init.method} ${path}`);
      return new Response(null, { status: 204 });
    }));
    expect((await post({ deviceId: "beamer", trackId: "t1" })).status).toBe(200);
    expect((await post({ deviceId: "beamer" })).status).toBe(200);
    expect(calls).toEqual(["PUT /me/player/play?device_id=beamer", "PUT /me/player"]);
  });

  it("rejects requests without a device", async () => {
    expect((await post({ trackId: "t1" })).status).toBe(400);
  });
});
